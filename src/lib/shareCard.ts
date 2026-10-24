import type { RacePrediction } from "./model";
import { num, ordinal, pct, weatherLabel } from "./format";
import { tStatic } from "./language";

const W = 1200;
const H = 675;

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const wrap = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2,
): string[] => {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
};

export async function downloadPredictionCard(prediction: RacePrediction, pick?: string) {
  try {
    await document.fonts.ready;
  } catch {
    /* segue com fallback */
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#07080b";
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.82, -40, 10, W * 0.82, -40, 620);
  glow.addColorStop(0, "rgba(255,45,18,0.45)");
  glow.addColorStop(1, "rgba(255,45,18,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(40, H, 10, 40, H, 520);
  glow2.addColorStop(0, "rgba(46,230,168,0.12)");
  glow2.addColorStop(1, "rgba(46,230,168,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 46) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Marca
  ctx.fillStyle = "#ff2d12";
  roundedRect(ctx, 60, 52, 44, 44, 11);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "900 17px 'Titillium Web', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("A", 82, 81);

  ctx.textAlign = "left";
  ctx.fillStyle = "#f3f5f9";
  ctx.font = "900 26px 'Titillium Web', sans-serif";
  ctx.fillText("APEX", 118, 76);
  ctx.fillStyle = "#8b95a7";
  ctx.font = "600 10px 'Titillium Web', sans-serif";
  ctx.fillText("RACE INTELLIGENCE", 119, 91);

  ctx.textAlign = "right";
  ctx.fillStyle = "#ff6a3d";
  ctx.font = "700 12px 'Titillium Web', sans-serif";
  ctx.fillText(`ROUND ${prediction.round} · ${prediction.race.flag} ${prediction.race.country.toUpperCase()}`, W - 60, 70);
  ctx.fillStyle = "#8b95a7";
  ctx.fillText(tStatic("PREVISÃO PRÉ-CORRIDA"), W - 60, 90);

  // Título
  ctx.textAlign = "left";
  ctx.fillStyle = "#f3f5f9";
  ctx.font = "900 62px 'Titillium Web', sans-serif";
  const titleLines = wrap(ctx, prediction.race.shortName.toUpperCase(), 640, 2);
  titleLines.forEach((line, i) => ctx.fillText(line, 60, 186 + i * 62));

  ctx.fillStyle = "#8b95a7";
  ctx.font = "600 15px 'Titillium Web', sans-serif";
  ctx.fillText(
    tStatic("{circuit} · {laps} voltas · {sims} simulações", {
      circuit: prediction.race.circuitName,
      laps: prediction.race.laps,
      sims: num(prediction.sims),
    }),
    60,
    318,
  );

  // Pódio
  const podium = prediction.drivers.slice(0, 3);
  podium.forEach((driver, index) => {
    const x = 60 + index * 260;
    const y = 370;
    ctx.save();
    roundedRect(ctx, x, y, 238, 178, 14);
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.stroke();

    ctx.fillStyle = driver.teamColor;
    roundedRect(ctx, x, y, 238, 4, 2);
    ctx.fill();

    ctx.fillStyle = "#8b95a7";
    ctx.font = "700 11px 'Titillium Web', sans-serif";
    ctx.fillText(
      `${ordinal(index + 1)}${index === 0 ? tStatic(" · FAVORITO") : ""}`,
      x + 18,
      y + 32,
    );

    ctx.fillStyle = "#f3f5f9";
    ctx.font = "900 34px 'Titillium Web', sans-serif";
    ctx.fillText(driver.code, x + 18, y + 76);

    ctx.fillStyle = "#8b95a7";
    ctx.font = "600 11px 'Titillium Web', sans-serif";
    ctx.fillText(driver.name.toUpperCase().slice(0, 24), x + 18, y + 96);

    ctx.fillStyle = driver.teamColor;
    ctx.font = "700 11px 'Titillium Web', sans-serif";
    ctx.fillText(driver.teamName.toUpperCase(), x + 18, y + 114);

    ctx.fillStyle = "#f3f5f9";
    ctx.font = "900 32px 'Titillium Web', sans-serif";
    ctx.fillText(pct(driver.win, 1), x + 18, y + 154);
    ctx.fillStyle = "#8b95a7";
    ctx.font = "600 10px 'Titillium Web', sans-serif";
    ctx.fillText(tStatic("CHANCE DE VITÓRIA"), x + 108, y + 153);
    ctx.restore();
  });

  // Contexto
  const boxX = 60;
  const boxY = 574;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  roundedRect(ctx, boxX, boxY, 1080, 54, 10);
  ctx.fill();
  ctx.fillStyle = "#8b95a7";
  ctx.font = "600 11px 'Titillium Web', sans-serif";
  ctx.fillText(
    tStatic("{weather} · caos {chaos}/100 · Safety Car {sc} · pódio mais provável {podium}", {
      weather:
        prediction.weather === "dry"
          ? tStatic("Pista seca")
          : tStatic(weatherLabel(prediction.weather)),
      chaos: prediction.chaos,
      sc: pct(prediction.safetyCar),
      podium: prediction.podiumCombo.codes.join(" · "),
    }),
    boxX + 18,
    boxY + 23,
  );
  ctx.fillStyle = "#606a7b";
  ctx.font = "600 9.5px 'Titillium Web', sans-serif";
  ctx.fillText(
    tStatic(
      "Modelo Monte Carlo com dados Jolpica-F1 + OpenF1 · projeção, não certeza. Jogue com responsabilidade.",
    ),
    boxX + 18,
    boxY + 41,
  );

  if (pick) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffd23f";
    ctx.font = "700 13px 'Titillium Web', sans-serif";
    ctx.fillText(`SEU PALPITE: ${pick}`, W - 78, 352);
  }

  const link = document.createElement("a");
  link.download = `apex-${prediction.race.circuitId}-${prediction.round}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
