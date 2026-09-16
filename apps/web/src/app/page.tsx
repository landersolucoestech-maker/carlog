export default function HomePage() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <div className="brand">CAR LOG</div>
        <nav>
          <a href="#services">Services</a>
          <a href="#process">How It Works</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">AUTO TRANSPORT</p>
          <h1>Vehicle shipping with a broker team built around execution.</h1>
          <p className="lead">Car Log coordinates quotes, carriers, dispatch, communication, delivery and follow-up in one operational flow.</p>
          <div className="actions"><a className="primary" href="#contact">Request a Quote</a></div>
        </div>
        <aside className="hero-card">
          <strong>Broker-managed transport</strong>
          <span>Carrier sourcing, compliance, dispatch and delivery coordination.</span>
        </aside>
      </section>

      <section id="services" className="section">
        <div className="section-head"><p className="eyebrow">SERVICES</p><h2>Built for real vehicle transport workflows.</h2></div>
        <div className="grid">
          <article><h3>Open Transport</h3><p>Practical nationwide vehicle shipping for standard moves.</p></article>
          <article><h3>Enclosed Transport</h3><p>Additional protection for premium, collectible and specialty vehicles.</p></article>
          <article><h3>Broker Coordination</h3><p>Quote, carrier selection, dispatch, pickup and delivery managed as one process.</p></article>
        </div>
      </section>

      <section id="process" className="section muted">
        <div className="section-head"><p className="eyebrow">HOW IT WORKS</p><h2>From quote to delivery.</h2></div>
        <div className="steps">
          <div><span>01</span><h3>Request</h3><p>Share route and vehicle details.</p></div>
          <div><span>02</span><h3>Quote</h3><p>Receive transport pricing and next steps.</p></div>
          <div><span>03</span><h3>Dispatch</h3><p>An eligible carrier is sourced and assigned.</p></div>
          <div><span>04</span><h3>Delivery</h3><p>Pickup, transit and delivery are coordinated through completion.</p></div>
        </div>
      </section>

      <section id="contact" className="section contact">
        <div><p className="eyebrow">GET STARTED</p><h2>Move your vehicle with Car Log.</h2><p>Request a quote and let the brokerage team coordinate the shipment.</p></div>
        <a className="primary" href="mailto:operations@carlog.local">Request a Quote</a>
      </section>

      <footer>Car Log</footer>
    </main>
  );
}
