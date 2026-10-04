import { useState, useEffect } from 'react';
import { ProductCard } from './ProductCard';
import './App.css';

const STORAGE_KEY = 'screenId';
const DEFAULT_REFRESH_MS = 30000;
const RETRY_MS = 10000;
const BLOCKS_PER_SCREEN = 2;

function loadStoredId() {
  try {
    const id = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function storeId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    /* storage unavailable: id lives only until reload */
  }
}

// StrictMode runs effects twice in dev; share one in-flight register call so only one screen is created
let registering = null;
function registerScreen() {
  if (!registering) {
    registering = fetch('/api/screens/register', { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error('register failed');
        return res.json();
      })
      .then(({ id }) => {
        storeId(id);
        return id;
      })
      .finally(() => {
        registering = null;
      });
  }
  return registering;
}

function toProduct(item) {
  const price = typeof item.price === 'number' ? item.price.toFixed(2) : '—';
  return { id: item.barcode, name: item.name, description: item.um || '', price };
}

function IdForm({ onSubmit, onRegisterNew, busy }) {
  const [value, setValue] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) onSubmit(id);
  };
  return (
    <form className="id-form d-flex gap-2 justify-content-center mt-4" onSubmit={submit}>
      <input
        className="form-control"
        type="number"
        min="1"
        placeholder="ID"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="btn btn-success" type="submit">Folosește ID</button>
      {onRegisterNew && (
        <button className="btn btn-outline-secondary" type="button" disabled={busy} onClick={onRegisterNew}>
          Înregistrează ecran nou
        </button>
      )}
    </form>
  );
}

function Message({ children }) {
  return (
    <div className="loading-state">
      <div className="text-center config-error">{children}</div>
    </div>
  );
}

function App() {
  const [screenId, setScreenId] = useState(loadStoredId);
  const [screen, setScreen] = useState(null);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [registering, setRegistering] = useState(false);

  const changeId = (id) => {
    storeId(id);
    setScreen(null);
    setNotFound(false);
    setError(null);
    setScreenId(id);
  };

  const registerNew = async () => {
    setRegistering(true);
    setError(null);
    try {
      const id = await registerScreen();
      setScreen(null);
      setNotFound(false);
      setScreenId(id);
    } catch {
      setError('Serverul nu răspunde');
    } finally {
      setRegistering(false);
    }
  };

  useEffect(() => {
    if (screenId == null) return;
    let cancelled = false;
    let timer;
    let delay = DEFAULT_REFRESH_MS;

    const schedule = () => {
      if (!cancelled) timer = setTimeout(tick, delay);
    };

    async function tick() {
      try {
        const res = await fetch(`/api/screen/${screenId}`);
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Eroare la încărcare');
        if (cancelled) return;
        setScreen(body);
        setError(null);
        if (body.refresh_seconds) delay = body.refresh_seconds * 1000;
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        delay = Math.min(delay, RETRY_MS);
      }
      schedule();
    }

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [screenId]);

  if (screenId == null) {
    return (
      <Message>
        <h1 className="display-4 mb-2">Ecran neconfigurat</h1>
        <p className="fs-5 text-muted mb-0">Acest ecran nu are încă un ID</p>
        {error && <p className="text-danger mt-3 mb-0">{error}</p>}
        <IdForm onSubmit={changeId} onRegisterNew={registerNew} busy={registering} />
      </Message>
    );
  }

  if (notFound) {
    return (
      <Message>
        <div className="config-error-icon">⚠</div>
        <p className="text-danger fs-4 mb-0">Ecranul cu ID {screenId} nu există pe server</p>
        <IdForm onSubmit={changeId} onRegisterNew={registerNew} />
      </Message>
    );
  }

  if (!screen) {
    if (error) {
      return (
        <Message>
          <div className="config-error-icon">⚠</div>
          <p className="text-danger fs-4 mb-0">{error}</p>
        </Message>
      );
    }
    return (
      <div className="loading-state">
        <div className="text-center">
          <div className="spinner-border text-success mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted mb-0">Se conectează la server…</p>
        </div>
      </div>
    );
  }

  if (!screen.configured) {
    return (
      <Message>
        <h1 className="display-1 mb-2">ID {screenId}</h1>
        <p className="fs-3 text-muted mb-0">Ecran neconfigurat</p>
        <IdForm onSubmit={changeId} />
      </Message>
    );
  }

  const blocks = screen.blocks.slice(0, BLOCKS_PER_SCREEN);
  const maxRows = Math.max(...blocks.map((b) => Math.ceil(b.items.length / b.width)), 1);

  return (
    <div className="shop-container d-flex flex-column">
      <div className="row g-0 flex-grow-1 min-h-0">
        {blocks.map((block, index) => {
          const showDelimiter = blocks.length > 1 && index === 0;
          return (
            <div
              key={`${index}-${block.title}`}
              className={`col-12 col-lg-${block.width * 2} d-flex min-h-0 gama-section ${showDelimiter ? 'gama-section-delimiter' : ''} ${index % 2 ? 'gama-section--alt' : ''}`}
            >
              <div className="section-panel flex-grow-1 min-h-0">
                <div className="section-header">
                  <h2 className="section-title mb-0">{block.title}</h2>
                </div>
                <div className="product-area flex-grow-1 min-h-0 position-relative">
                  {showDelimiter && <div className="gama-delimiter" />}
                  <div
                    className="product-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${block.width}, 1fr)`,
                      gridTemplateRows: `repeat(${maxRows}, 72px)`,
                      gap: '0.35rem',
                    }}
                  >
                    {block.items.map((item) => (
                      <ProductCard key={item.barcode} product={toProduct(item)} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;
