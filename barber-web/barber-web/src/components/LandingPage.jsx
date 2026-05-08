// LandingPage.jsx
import { useEffect, useRef, useState } from "react";
import { fetchPlanPricing } from "../services/api";
import styles from "../styles/LandingPage.module.css";
import { SHIFT_APP_BRAND_NAME } from "../utils/businessCopy";
import { CUSTOM_PLAN_URL } from "../utils/publicLinks";

const REGISTER_URL = "/registro";
const APP_STORE_URL = "https://apps.apple.com";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.shifthub.pro";

function LandingPage() {
  const [pricing, setPricing] = useState({
    basic: { ars: 25000, usdReference: 25 },
    pro: { ars: 35000, usdReference: 35 },
  });

  const plans = [
    {
      badge: "Basico",
      title: "Todo lo necesario para vender turnos online",
      price: `ARS ${pricing.basic.ars.toLocaleString("es-AR")}`,
      billingLabel: `por mes · ref. USD ${pricing.basic.usdReference}`,
      description:
        "Ideal para negocios de turnos que quieren ordenar la agenda, automatizar reservas y empezar a cobrar online sin complejidad.",
      features: [
        "Personalizacion de colores y logo",
        "Link personalizado",
        "Vinculacion con Mercado Pago",
        "Carga infinita de profesionales",
        "Carga infinita de servicios",
        "Turnos ilimitados",
        "Vinculacion con WhatsApp para cancelacion",
        "Confirmacion y recordatorio via mail",
        "Notificacion via app para el profesional",
      ],
      cta: "Conocer plan basico",
      href: "/planes?plan=basic",
      tier: "basic",
    },
    {
      badge: "Pro",
      title: "Metricas, historial y control mas profundo",
      price: `ARS ${pricing.pro.ars.toLocaleString("es-AR")}`,
      billingLabel: `por mes · ref. USD ${pricing.pro.usdReference}`,
      description:
        "Ideal para equipos con mas volumen que necesitan medir mejor el negocio.",
      features: [
        "Todo lo del plan Basico",
        "Metricas generales e individuales",
        "Metricas mensuales y anuales",
        "Historial de servicios, turnos y caja",
        "Exportacion por mail, PDF y Excel",
      ],
      cta: "Conocer plan pro",
      href: "/planes?plan=pro",
      tier: "pro",
    },
    {
      badge: "Personalizable",
      title: "Marca propia y solucion hecha a medida",
      price: "A medida",
      billingLabel: "consultar por WhatsApp",
      description:
        "Ideal para negocios o cadenas que buscan identidad propia, dominio propio y una app con nombre propio.",
      features: [
        "Todo lo del plan Pro",
        "Personalizacion completa de la web",
        "Dominio propio",
        "App con nombre propio en stores",
        "Implementacion y presupuesto personalizado",
      ],
      cta: "Hablar por un plan a medida",
      href: CUSTOM_PLAN_URL,
      external: true,
      tier: "custom",
    },
  ];

  const heroRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    fetchPlanPricing()
      .then((response) => {
        if (!mounted) return;
        setPricing({
          basic: {
            ars: Number(response.pricing?.basic?.ars || 25000),
            usdReference: Number(response.pricing?.basic?.usdReference || 25),
          },
          pro: {
            ars: Number(response.pricing?.pro?.ars || 35000),
            usdReference: Number(response.pricing?.pro?.usdReference || 35),
          },
        });
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (heroRef.current) {
        heroRef.current.style.transform = `translateY(${window.scrollY * 0.25}px)`;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll("[data-animate]");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(styles.visible);
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const features = [
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
      title: "Turnos online 24/7",
      desc: "Tus clientes reservan cuando quieren, desde cualquier lugar, sin llamarte.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      ),
      title: "Notificaciones al instante",
      desc: "Recibs una notificacion cada vez que alguien reserva. Nada se te escapa.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
      title: "Equipo completo",
      desc: "Gestiona todo tu equipo desde una sola cuenta. Cada integrante con su agenda.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
        </svg>
      ),
      title: "Confirmacion por email",
      desc: "Tus clientes reciben un email con los detalles de su turno automaticamente.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
      title: "Horarios flexibles",
      desc: "Configura horario corrido o doble jornada. Se adapta a como trabajas vos.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
        </svg>
      ),
      title: "App nativa",
      desc: "Disponible para iOS y Android. Rapida, fluida y pensada para el dia a dia.",
    },
  ];

  const stats = [
    { num: "0 min", label: "de configuracion" },
    { num: "24/7", label: "reservas disponibles" },
    { num: "100%", label: "sin comisiones ocultas" },
  ];

  const steps = [
    {
      n: "01",
      title: "Descarga la app",
      desc: "Disponible en App Store y Google Play.",
    },
    {
      n: "02",
      title: "Configura tu negocio",
      desc: "Agrega tu equipo, servicios y horarios en minutos.",
    },
    {
      n: "03",
      title: "Comparte tu link",
      desc: "Tus clientes reservan desde su celu sin registrarse.",
    },
  ];

  return (
    <div className={styles.landing}>
      <div className={styles.noiseBg} aria-hidden="true" />
      <div className={styles.bgMesh} aria-hidden="true" />
      <div className={styles.bgOrb1} aria-hidden="true" />
      <div className={styles.bgOrb2} aria-hidden="true" />

      {/* PARTICLES */}
      <div className={styles.particles} aria-hidden="true">
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} className={styles.particle} style={{ "--i": i }} />
        ))}
      </div>

      {/* NAV */}
      <nav className={styles.nav}>
        <div className={styles.navLogo}>
          <div className={styles.navLogoMark}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <span className={styles.navLogoText}>{SHIFT_APP_BRAND_NAME}</span>
        </div>
        <div className={styles.navActions}>
          <a href={REGISTER_URL} className={styles.navCta}>
            Registrate
          </a>
          <a
            href="https://www.letsbuilditcodex.com/"
            target="_blank"
            rel="noreferrer"
            className={styles.navBadgeLink}
          >
            <span className={styles.navBadge}>by CODEX</span>
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section className={styles.hero}>
        <div ref={heroRef} className={styles.heroInner}>
          <div className={`${styles.heroEyebrow} ${styles.animDelay0}`} data-animate>
            <span className={styles.eyebrowPulse} />
            Sistema de turnos inteligente
          </div>

          <h1 className={`${styles.heroTitle} ${styles.animDelay1}`} data-animate>
            Tu agenda,
            <br />
            <span className={styles.heroAccent}>sin caos.</span>
          </h1>

          <p className={`${styles.heroSub} ${styles.animDelay2}`} data-animate>
            Reservas online 24/7, notificaciones automaticas y gestion de agenda
            para estetica, peluqueria, salud, wellness, tatuajes y mas.
          </p>

          <p className={`${styles.heroNote} ${styles.animDelay2}`} data-animate>
            Registrate y activa tu plan desde la web. Despues descargas la app
            en iPhone o Android e ingresas con tu cuenta.
          </p>

          <div className={`${styles.ctaGroup} ${styles.animDelay3}`} data-animate>
            <a href={REGISTER_URL} className={styles.btnPrimary}>
              <span>Registrate y activa tu cuenta</span>
              <div className={styles.btnShine} />
            </a>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className={styles.btnGhost}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              App Store
            </a>
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className={styles.btnGhost}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.18 23.76c.3.17.64.24.99.2l12.5-7.22-2.6-2.6-10.89 9.62zm-1.93-20.7A2 2 0 0 0 1 4.08v15.84c0 .45.13.87.35 1.23l.08.08 8.87-8.87v-.21L1.25 3.06zm18.63 8.06-2.55-1.47-2.9 2.9 2.9 2.9 2.56-1.48c.73-.42.73-1.43-.01-1.85zm-17.5 10.6 10.89-9.62-2.6-2.6L1.25 20.7c.3.35.72.57 1.13.72z" />
              </svg>
              Google Play
            </a>
          </div>

          {/* PHONE MOCKUP */}
          <div className={`${styles.phoneMockup} ${styles.animDelay4}`} data-animate>
            <div className={styles.phoneHalo} />
            <div className={styles.phoneHalo2} />
            <div className={styles.phoneDevice}>
              <div className={styles.phoneSpeaker} />
              <div className={styles.phoneScreen}>
                <div className={styles.screenApp}>
                  <div className={styles.appHeader}>
                    <div className={styles.appGreeting}>Bienvenido</div>
                    <div className={styles.appLogoMark}>{SHIFT_APP_BRAND_NAME.charAt(0)}</div>
                  </div>
                  <div className={styles.appTitle}>{SHIFT_APP_BRAND_NAME.toUpperCase()}</div>
                  <div className={styles.appDivider} />
                  <div className={styles.appLabel}>Correo electronico</div>
                  <div className={styles.appInput}>usuario@ejemplo.com</div>
                  <div className={styles.appLabel}>Contrasena</div>
                  <div className={styles.appInput}>
                    <span className={styles.appDots}>••••••••</span>
                  </div>
                  <button className={styles.appBtn}>Ingresar</button>
                  <div className={styles.appFooter}>
                    Sin cuenta? <span>Registrate</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.scrollHint}>
          <div className={styles.scrollTrack}>
            <div className={styles.scrollThumb} />
          </div>
          <span>scroll</span>
        </div>
      </section>

      {/* PLANS */}
      <section id="planes" className={styles.plansSection}>
        <div className={`${styles.sectionLabel} ${styles.revealUp}`} data-animate>
          Planes
        </div>
        <h2 className={`${styles.sectionTitle} ${styles.revealUp} ${styles.animDelay1}`} data-animate>
          Elegi el nivel que mejor
          <br />
          acompana tu negocio.
        </h2>
        <div className={styles.plansGrid}>
          {plans.map((plan, i) => (
            <article
              key={plan.badge}
              className={`${styles.planCard} ${plan.tier === "pro" ? styles.planCardPro : ""} ${styles.revealUp}`}
              data-animate
              style={{ "--delay": `${i * 0.1}s` }}
            >
              {plan.tier === "pro" && <div className={styles.planPopular}>Mas popular</div>}
              <div className={`${styles.planBadge} ${styles[`planBadge_${plan.tier}`]}`}>
                {plan.badge}
              </div>
              <h3 className={styles.planTitle}>{plan.title}</h3>
              <div className={styles.planPricing}>
                <span className={styles.planPrice}>{plan.price}</span>
                <span className={styles.planBillingLabel}>{plan.billingLabel}</span>
              </div>
              <p className={styles.planDesc}>{plan.description}</p>
              <ul className={styles.planList}>
                {plan.features.map((f) => (
                  <li key={f}>
                    <span className={`${styles.planCheck} ${styles[`planCheck_${plan.tier}`]}`}>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2,6 5,9 10,3"/>
                      </svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={plan.href}
                target={plan.external ? "_blank" : undefined}
                rel={plan.external ? "noreferrer" : undefined}
                className={`${styles.planCta} ${styles[`planCta_${plan.tier}`]}`}
              >
                {plan.cta}
              </a>
            </article>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className={styles.featuresSection}>
        <div className={`${styles.sectionLabel} ${styles.revealUp}`} data-animate>
          Por que {SHIFT_APP_BRAND_NAME}
        </div>
        <h2 className={`${styles.sectionTitle} ${styles.revealUp} ${styles.animDelay1}`} data-animate>
          Todo lo que necesitas,
          <br />
          nada de lo que no.
        </h2>
        <div className={styles.featuresGrid}>
          {features.map((f, i) => (
            <div
              className={`${styles.featureCard} ${styles.revealUp}`}
              data-animate
              key={i}
              style={{ "--delay": `${i * 0.09}s` }}
            >
              <div className={styles.featureIconBox}>{f.icon}</div>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
              <div className={styles.featureGlow} />
            </div>
          ))}
        </div>
      </section>

      {/* STATS */}
      <section className={styles.statsSection}>
        <div className={`${styles.statsBar} ${styles.revealUp}`} data-animate>
          {stats.map((s, i) => (
            <div className={styles.statCell} key={i}>
              <div className={styles.statNum}>{s.num}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className={styles.howSection}>
        <div className={`${styles.sectionLabel} ${styles.revealUp}`} data-animate>
          Como funciona
        </div>
        <h2 className={`${styles.sectionTitle} ${styles.revealUp} ${styles.animDelay1}`} data-animate>
          En 3 pasos, listo.
        </h2>
        <div className={styles.stepsContainer}>
          {steps.map((s, i) => (
            <div
              className={`${styles.stepRow} ${styles.revealLeft}`}
              data-animate
              key={i}
              style={{ "--delay": `${i * 0.15}s` }}
            >
              <div className={styles.stepNum}>{s.n}</div>
              <div className={styles.stepBody}>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepDesc}>{s.desc}</p>
              </div>
              <div className={styles.stepConnector} />
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className={styles.ctaFinal}>
        <div className={styles.ctaFinalGlow} />
        <h2 className={`${styles.ctaFinalTitle} ${styles.revealUp}`} data-animate>
          Listo para dejar de
          <br />
          perder turnos?
        </h2>
        <p className={`${styles.ctaFinalSub} ${styles.revealUp} ${styles.animDelay1}`} data-animate>
          Negocios de distintos rubros ya usan {SHIFT_APP_BRAND_NAME}. Unite hoy.
        </p>
        <div className={`${styles.ctaGroup} ${styles.revealUp} ${styles.animDelay2}`} data-animate>
          <a href={REGISTER_URL} className={styles.btnPrimary}>
            <span>Registrate y activa tu cuenta</span>
            <div className={styles.btnShine} />
          </a>
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className={styles.btnGhost}>
            App Store
          </a>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className={styles.btnGhost}>
            Google Play
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerLogo}>
            <div className={styles.footerLogoMark}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <span>{SHIFT_APP_BRAND_NAME}</span>
          </div>
          <a href="https://www.letsbuilditcodex.com/" target="_blank" rel="noreferrer" className={styles.footerCredit}>
            {SHIFT_APP_BRAND_NAME} by <strong>CODEX</strong> · {new Date().getFullYear()}
          </a>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
