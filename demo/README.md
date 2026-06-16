# NetShield AI — Live Demo

A web dashboard that runs the project's **real trained XGBoost model** on
held-out CICIDS-2017 flows. Built on a Claude-Design SOC mockup, but rewired so
the key screens show genuine model output instead of placeholder data.

> **Honesty note.** This is a *demo of a model*, not a deployed product. Four
> screens are wired to the real model; the rest are kept from the original
> mockup as **illustrative design only** and are clearly tagged `CONCEPT` in
> the sidebar. Nothing labelled real is faked, and nothing faked is labelled
> real. See "What's real vs concept" below.

---

## What's real vs concept

| Screen | Status | What it shows |
|---|---|---|
| **Live Detection** | ✅ REAL | Streams real held-out test flows through the real XGBoost model via WebSocket. Pick a scenario (Normal / Under Attack / Mixed / DDoS / PortScan / Web Attack); watch live predictions, running accuracy, detection rate, false-positive rate, class mix. |
| **ML Analytics** | ✅ REAL | Confusion matrix + per-class precision/recall/F1 computed live on the held-out test set; model-comparison cards from the real `comparison_metrics.json`. |
| **Explainability** | ✅ REAL | Global feature importance straight from the trained model (`bwd_header_ratio`, `Init_Win`, etc. — the real top features). |
| **Dashboard** | 🟡 mixed | Visual SOC overview from the mockup. The "Active Model" card shows real numbers; the large vanity counters (packet-billions, geographies) are illustrative. |
| Live Traffic | ⚪ CONCEPT | Animated topology — illustrative, no real data. |
| Threat Detection | ⚪ CONCEPT | Mockup feed. |
| Attack History | ⚪ CONCEPT | Mockup. |
| API Monitoring | ⚪ CONCEPT | Mockup. |

---

## Requirements

- **Python 3.10+** with the backend deps (`demo/backend/requirements.txt`)
- A modern browser
- The model assets in `demo/demo_assets/` (already present):
  `xgb_multi_best.json`, `test_selected.parquet`, `label_mapping.csv`,
  `comparison_metrics.json`. (Feature names are derived from the parquet, so
  `feature_list.json` is not required.)

---

## Run it (two terminals)

### 1 — Backend (FastAPI, serves the model)

```bash
cd demo/backend
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Confirm it loaded the model — open <http://127.0.0.1:8000/api/health>, you should see
`"ready": true` and `"n_test_rows": 514853`.

### 2 — Frontend (any static file server)

```bash
cd demo/frontend
python -m http.server 8080
```

Then open <http://127.0.0.1:8080/index.html>, click **Authenticate & Enter SOC**
(the login is cosmetic — any/no input works), and go to **Live Detection**.

> The frontend talks to the backend at `http://127.0.0.1:8000` by default.
> To change it, set `window.NETSHIELD_API` in `index.html` before the bundle loads.

---

## Demo script (for the presentation)

1. **Open Live Detection.** It connects to the model (badge: `MODEL LIVE`).
2. Click **Normal Traffic** — show the feed is almost all green BENIGN, accuracy ~100%.
3. Click **Under Attack** (or **DDoS Burst**) — the feed fills with red attack
   predictions; point out *Detection Rate* climbing and the per-class mix.
4. Click **Mixed / Realistic** — the realistic blend; note the model keeps a low
   false-positive rate on the benign majority.
5. Switch to **ML Analytics** — the confusion matrix and per-class F1 are computed
   live on the held-out test set; call out Bot/Infiltration (~0.83) and Web Attack
   (~0.99) as the rare-class story.
6. Switch to **Explainability** — show the real top features driving the model.
7. Point at the `CONCEPT` tags and state plainly: *"those screens are design
   concepts; the four above run the actual model."* That honesty is a strength.

---

## How the "live" feed works (and why not real packet capture)

The stream replays **real held-out CICIDS-2017 test flows** — rows the model never
saw in training — through the model on a timer. It is real ML on real attack data;
only the *timing* is simulated.

We deliberately did **not** build live packet capture from a network interface.
Doing so would require a CICFlowMeter-style pipeline to turn raw packets into the
78 flow features, and — per the robustness analysis in the main project report
(§4c) — the model is sensitive to feature-distribution shift, so it would produce
many false positives on traffic captured in a different environment than the
CICIDS-2017 testbed. Live capture is documented as future work in the report.

---

## Editing the frontend

The screens are individual files in `demo/frontend/src/`. They are concatenated
into `src/bundle.jsx` (which `index.html` loads) so execution order is guaranteed.
After editing any `src/*.jsx`, rebuild the bundle:

```bash
cd demo/frontend
python build_bundle.py
```

Then refresh the browser.

---

## Files

```
demo/
├── backend/
│   ├── app.py              FastAPI: /health /metrics /predict /importance /stream
│   └── requirements.txt
├── frontend/
│   ├── index.html          loads src/bundle.jsx
│   ├── styles.css          (from the design mockup)
│   ├── build_bundle.py     concatenates src/*.jsx -> src/bundle.jsx
│   └── src/
│       ├── realdata.jsx        API client + live hooks (added)
│       ├── screen-livedetect.jsx  real model-driven simulation (added)
│       ├── screen-ml.jsx       wired to /metrics
│       ├── screen-shap.jsx     wired to /importance
│       ├── chrome.jsx          sidebar (real vs CONCEPT tagging)
│       └── …                   other screens from the mockup
└── demo_assets/            the trained model + test data (from Kaggle)
```
