import { useRef, useEffect, useState, useCallback } from 'react';

function parseWeightOrVolume(text) {
  if (!text || typeof text !== 'string') return null;
  const s = text.replace(/\s+/g, ' ').trim();
  // Require number at word boundary (start or after space) so "c1 gr" doesn't match - "1" is part of code
  const wordBoundaryNum = '(?:^|\\s)(\\d+(?:[.,]\\d+)?)\\s*';
  const kgMatch = s.match(new RegExp(wordBoundaryNum + '(?:kg|kilo)\\b', 'i'));
  const literMatch = s.match(new RegExp(wordBoundaryNum + '(?:l|liter|litru)\\b', 'i'));
  const mlMatch = s.match(new RegExp(wordBoundaryNum + 'ml\\b', 'i'));
  const gMatch = s.match(new RegExp(wordBoundaryNum + 'g(?:ram)?s?\\b', 'i'));
  const grMatch = s.match(new RegExp(wordBoundaryNum + 'gr\\b', 'i'));
  if (kgMatch) return { value: parseFloat(kgMatch[1].replace(',', '.')), unit: 'KG' };
  if (gMatch) return { value: parseFloat(gMatch[1].replace(',', '.')) / 1000, unit: 'KG' };
  if (grMatch) return { value: parseFloat(grMatch[1].replace(',', '.')) / 1000, unit: 'KG' };
  if (literMatch) return { value: parseFloat(literMatch[1].replace(',', '.')), unit: 'L' };
  if (mlMatch) return { value: parseFloat(mlMatch[1].replace(',', '.')) / 1000, unit: 'L' };
  return null;
}

function getPricePerUnit(product) {
  const priceVal = parseFloat(String(product.price || '').replace(',', '.'));
  if (Number.isNaN(priceVal) || priceVal <= 0) return null;
  const info = parseWeightOrVolume(product.name) || parseWeightOrVolume(product.description || '');
  if (!info || info.value <= 0) return null;
  const perUnit = priceVal / info.value;
  return { value: perUnit.toFixed(2), unit: info.unit };
}

// Romanian flag drawn as 3 SVG stripes whose edges follow a travelling sine wave (fixed at the pole, growing toward the free end)
const FLAG_W = 30;
const FLAG_H = 16;
const WAVE_AMP = 2.4;
const WAVE_LEN = 22;
const FLAG_COLORS = ['#002B7F', '#FCD116', '#CE1126'];
const PHASES = [0, 1, 2, 3, 4].map((i) => (i * Math.PI) / 2);

function stripePath(stripe, phase) {
  const x0 = (stripe * FLAG_W) / 3;
  const x1 = ((stripe + 1) * FLAG_W) / 3 + 0.3;
  const xs = Array.from({ length: 9 }, (_, i) => x0 + ((x1 - x0) * i) / 8);
  const y = (x) => 3 + WAVE_AMP * (x / FLAG_W) * Math.sin((2 * Math.PI * x) / WAVE_LEN - phase);
  const top = xs.map((x) => `${x.toFixed(2)},${y(x).toFixed(2)}`);
  const bottom = [...xs].reverse().map((x) => `${x.toFixed(2)},${(y(x) + FLAG_H).toFixed(2)}`);
  return `M${top.join(' L')} L${bottom.join(' L')} Z`;
}

const FLAG_STRIPES = FLAG_COLORS.map((fill, i) => {
  const values = PHASES.map((p) => stripePath(i, p)).join(';');
  return { fill, d: stripePath(i, 0), values };
});

function WavingFlag() {
  return (
    <svg viewBox={`0 0 ${FLAG_W} 22`} width="2rem" role="img" aria-label="Romanian product">
      {FLAG_STRIPES.map(({ fill, d, values }) => (
        <path key={fill} d={d} fill={fill} stroke={fill} strokeWidth="0.3">
          <animate attributeName="d" values={values} dur="1.8s" repeatCount="indefinite" />
        </path>
      ))}
    </svg>
  );
}

export function ProductCard({ product }) {
  const cardRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);
  const isRomanian = /\s*RO\s*$/i.test((product.name || '').trim());
  const pricePer = getPricePerUnit(product);

  const updateScale = useCallback(() => {
    const card = cardRef.current;
    const content = contentRef.current;
    if (!card || !content) return;

    const cardHeight = card.offsetHeight;
    const cardWidth = card.offsetWidth;
    if (cardHeight <= 0 || cardWidth <= 0) return;

    void content.offsetHeight;
    const contentHeight = content.scrollHeight;
    const contentWidth = content.scrollWidth;

    const scaleH = contentHeight > 0 ? cardHeight / contentHeight : 1;
    const scaleW = contentWidth > 0 ? cardWidth / contentWidth : 1;
    const newScale = Math.min(scaleH, scaleW) * 0.96;

    setScale(Math.max(0.2, newScale));
  }, [product.name, product.price, product.description]);

  useEffect(() => {
    const card = cardRef.current;
    const content = contentRef.current;
    if (!card || !content) return;

    const runUpdate = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(updateScale);
      });
    };

    const observer = new ResizeObserver(runUpdate);
    observer.observe(card);
    observer.observe(content);

    runUpdate();
    const retry = setTimeout(runUpdate, 100);
    const retry2 = setTimeout(runUpdate, 500);

    window.addEventListener('resize', runUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', runUpdate);
      clearTimeout(retry);
      clearTimeout(retry2);
    };
  }, [updateScale]);

  return (
    <article ref={cardRef} className="product-card">
      <div className="product-card-corner">
        {pricePer && (
          <span className="product-card-price-per">
            {pricePer.value} / {pricePer.unit}
          </span>
        )}
        {isRomanian && (
          <span className="product-card-flag">
            <WavingFlag />
          </span>
        )}
      </div>
      <div
        ref={contentRef}
        className="product-card-content"
        style={{
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        <h3 className="product-header card-title mb-0">{product.name}</h3>
        <p className="product-price-um card-text mb-0">
          {product.price}{product.description ? ` / ${product.description}` : ''}
        </p>
      </div>
    </article>
  );
}
