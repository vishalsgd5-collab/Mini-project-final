/** Always-on-top guardian so face tracking continues over other apps/tabs. */

export function canFloat() {
  return "documentPictureInPicture" in window || document.pictureInPictureEnabled;
}

export async function startGuardian({ video, getHud }) {
  if ("documentPictureInPicture" in window) {
    const w = await documentPictureInPicture.requestWindow({ width: 300, height: 340 });
    const style = w.document.createElement("style");
    style.textContent = `
      html, body { margin: 0; background: #08110d; color: #f3eee4; font-family: system-ui, sans-serif; }
      video { width: 100%; height: 170px; object-fit: cover; transform: scaleX(-1); background: #000; }
      .hud { padding: 10px 12px 14px; }
      .k { letter-spacing: .14em; text-transform: uppercase; font-size: 10px; color: #d4b37a; }
      .s { font-size: 28px; font-family: Georgia, serif; margin: 4px 0; }
      .e { font-size: 12px; color: #c5d5cc; line-height: 1.4; }
    `;
    w.document.head.appendChild(style);
    const vid = w.document.createElement("video");
    vid.autoplay = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.srcObject = video.srcObject;
    const hud = w.document.createElement("div");
    hud.className = "hud";
    w.document.body.append(vid, hud);
    vid.play().catch(() => {});
    const tick = () => {
      if (!w.document) return;
      const s = getHud();
      hud.innerHTML = `<div class="k">AURA guardian · over all apps</div>
        <div class="s">${s.score} · ${s.level}</div>
        <div class="e">${s.line}</div>`;
    };
    const id = w.setInterval(tick, 400);
    tick();
    w.addEventListener("pagehide", () => w.clearInterval(id));
    return { type: "document", window: w };
  }
  if (video.requestPictureInPicture) {
    await video.requestPictureInPicture();
    return { type: "video" };
  }
  throw new Error("This Chrome build cannot float a window. Update Chrome, then try again.");
}
