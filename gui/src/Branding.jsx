import { useEffect, useState } from "react";
import App from "./App.jsx";
import visheshLogo from "../../Docs/logo.png";
import naradLogo from "../../Docs/NARAD-QC_Logo.png";

function DeveloperCredit() {
  return (
    <span>
      Developed by{" "}
      <a href="https://visheshverse.com" target="_blank" rel="noopener noreferrer">
        VisheshVerse
      </a>
    </span>
  );
}

export default function BrandedConsole() {
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setSplash(false), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      {splash && (
        <section className="brand-splash" aria-label="Welcome to NARAD-QC">
          <div className="splash-content">
            <div className="splash-logos">
              <img src={visheshLogo} alt="VisheshVerse logo" width="180" height="180" />
              <span className="splash-divider" aria-hidden="true" />
              <img src={naradLogo} alt="NARAD-QC logo" width="196" height="180" />
            </div>
            <p className="splash-credit"><DeveloperCredit /></p>
            <span className="splash-accent" aria-hidden="true" />
          </div>
          <button className="splash-enter" onClick={() => setSplash(false)}>
            Open console <span aria-hidden="true">→</span>
          </button>
        </section>
      )}
      <div className="console-content" inert={splash ? true : undefined}>
        <App />
        <footer className="developer-footer" aria-label="Developer information">
          <p className="footer-credit"><DeveloperCredit /></p>
          <a className="footer-email" href="mailto:visheshvishu1@outlook.com">
            visheshvishu1@outlook.com
          </a>
        </footer>
      </div>
    </>
  );
}
