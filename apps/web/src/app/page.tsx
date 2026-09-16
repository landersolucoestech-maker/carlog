import { QuoteRequestForm } from '../modules/acquisition/quote-request-form';
import { WebsiteChat } from '../modules/communication/website-chat';

const features = [
  ['Dedicated coordination', 'A transport specialist follows the shipment from quote through delivery instead of handing the customer between disconnected systems.'],
  ['Carrier-first operations', 'Carrier selection is tied to internal approval, authority, insurance and compliance workflows before dispatch.'],
  ['One operating system', 'Website leads, quotes, orders, dispatch, communications and finance flow into the same Car Log platform.'],
];

export default function HomePage() {
  return <main className="public-shell">
    <header className="site-header">
      <a className="brand" href="#top"><span className="brand-mark">CL</span><span>Car Log Connection</span></a>
      <nav className="site-nav" aria-label="Primary navigation">
        <a href="#services">Services</a><a href="#process">How it works</a><a href="#quote">Get a quote</a>
      </nav>
      <a className="header-cta" href="#quote">Get a quote</a>
    </header>

    <section id="top" className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Auto Transport Brokerage</p>
        <h1>Move your vehicle with a team that stays connected.</h1>
        <p>Car Log Connection coordinates vehicle transport with clear communication, carrier management and shipment visibility from the first request through final delivery.</p>
        <div className="hero-points"><span className="hero-point">Nationwide coordination</span><span className="hero-point">Carrier compliance workflow</span><span className="hero-point">Dedicated support</span></div>
      </div>
      <div id="quote"><QuoteRequestForm /></div>
    </section>

    <section id="services" className="section section-muted">
      <div className="section-heading"><p className="eyebrow">Built around the shipment</p><h2>Brokerage operations without fragmented communication.</h2><p>The public experience connects directly to the Car Log operating system, so lead context and communication do not disappear between the website and the operations team.</p></div>
      <div className="feature-grid">{features.map(([title,body]) => <article className="feature-card" key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>

    <section id="process" className="section">
      <div className="section-heading"><p className="eyebrow">Transport workflow</p><h2>From request to delivery.</h2><p>Request a quote, confirm shipment details, allow the brokerage team to source and verify a carrier, then stay connected through pickup, transit and delivery.</p></div>
      <div className="feature-grid">
        <article className="feature-card"><h3>1. Request</h3><p>Share the route, vehicle and contact details. Attribution is preserved so the team understands how the request originated.</p></article>
        <article className="feature-card"><h3>2. Coordinate</h3><p>The sales and dispatch teams manage quote acceptance, order preparation, carrier sourcing and assignment in one workflow.</p></article>
        <article className="feature-card"><h3>3. Deliver</h3><p>Operational status, communication and finance stay attached to the same order through delivery and settlement.</p></article>
      </div>
    </section>

    <footer className="site-footer"><strong>Car Log Connection</strong><span>Auto Transport Brokerage · United States</span></footer>
    <WebsiteChat />
  </main>;
}
