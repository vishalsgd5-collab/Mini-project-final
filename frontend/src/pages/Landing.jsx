import { Link } from "react-router-dom";
import { IconMark } from "../components/Icons";
import { useAuth } from "../auth";

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="land">
      <nav className="land-nav">
        <div className="brand">
          <IconMark />
          AURA
        </div>
        <div className="land-nav-links">
          <a href="#method">Method</a>
          <a href="#rituals">Care</a>
          {user ? (
            <Link className="btn btn-gold" to="/app/monitor">Open studio</Link>
          ) : (
            <Link className="btn btn-gold" to="/login">Enter</Link>
          )}
        </div>
      </nav>

      <section className="hero">
        <div>
          <div className="kicker">Adaptive unobtrusive rest assistant</div>
          <h1>
            See fatigue
            <br />
            <em>before it sees you.</em>
          </h1>
          <p className="lede">
            AURA watches blink rate, eyelid closure, head posture and work cadence
            through an ordinary webcam. A LightGBM model scores fatigue in real time.
            A contextual bandit then offers a 30–90 second ritual — only when it
            will actually be taken.
          </p>
          <div className="cta-row">
            <Link className="btn btn-gold" to={user ? "/app/monitor" : "/register"}>
              Begin a session
            </Link>
            <Link className="btn btn-ghost" to="/login">
              Demo · demo@aura.health
            </Link>
          </div>
        </div>
        <div className="iris-stage">
          <div className="lid top" />
          <div className="iris" />
          <div className="lid bot" />
        </div>
      </section>

      <div className="stats-strip">
        <div className="stat-cell"><span>Signals</span><strong>17</strong></div>
        <div className="stat-cell"><span>Rituals</span><strong>8</strong></div>
        <div className="stat-cell"><span>Typical pause</span><strong>30–90s</strong></div>
        <div className="stat-cell"><span>Video leaves device</span><strong>Never</strong></div>
      </div>

      <section className="section" id="method">
        <div className="algo">
          <div>
            <div className="kicker">How it thinks</div>
            <h2>Three layers, one quiet loop.</h2>
            <p className="sub">
              Nothing here is a fixed 25-minute timer. The system estimates your
              state, then learns which tiny interventions you will actually honour.
            </p>
          </div>
          <div className="algo-list">
            <div className="algo-item">
              <div className="num">01</div>
              <div>
                <h3>Face Mesh + EAR</h3>
                <p className="muted">MediaPipe 468 landmarks. Eye Aspect Ratio detects blinks; PERCLOS tracks lingering lid closure; a 4×4 transform yields head pitch, yaw and roll.</p>
              </div>
            </div>
            <div className="algo-item">
              <div className="num">02</div>
              <div>
                <h3>LightGBM fatigue score</h3>
                <p className="muted">Seventeen multimodal features — blinks, posture, typing cadence, idle ratio, circadian hour — collapse into a 0–100 score and a level: alert, mild, moderate, severe.</p>
              </div>
            </div>
            <div className="algo-item">
              <div className="num">03</div>
              <div>
                <h3>LinUCB bandit</h3>
                <p className="muted">A contextual multi-armed bandit picks the ritual with the highest upper confidence bound given your state, then updates from whether you completed it.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="rituals">
        <h2>Care, in doses you will actually take.</h2>
        <p className="sub">Each pause is short on purpose. Adherence beats ambition.</p>
        <div className="grid-3">
          <article className="card">
            <div className="chip">eyes</div>
            <h3>20-20-20 & palming</h3>
            <p>Far-focus resets the ciliary muscle. Warm palming drops visual load without leaving the desk.</p>
          </article>
          <article className="card">
            <div className="chip">posture</div>
            <h3>Spine stack & neck unlock</h3>
            <p>Forward-head pitch is the first musculoskeletal tell. Thirty-five seconds is enough to reverse it.</p>
          </article>
          <article className="card">
            <div className="chip">breath · body</div>
            <h3>Box breathing, water, a walk</h3>
            <p>When the score climbs past 70, AURA prefers a down-regulating breath or a 75-second micro walk.</p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <span>AURA · academic wellness system</span>
        <span>Video stays in the browser. Only numeric features leave the machine.</span>
      </footer>
    </div>
  );
}
