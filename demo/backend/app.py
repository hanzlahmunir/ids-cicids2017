"""
NetShield AI — demo backend.

Serves the trained CICIDS-2017 XGBoost model behind a small FastAPI app so the
React frontend can show *real* predictions instead of synthetic placeholder data.

Endpoints
---------
GET  /api/health        -> is the model + data loaded?
GET  /api/metrics       -> real model metrics (confusion matrix, per-class F1, ...)
POST /api/predict       -> classify one or more flows (list of feature dicts)
WS   /api/stream        -> replay held-out test flows through the model as a live feed

Design notes
------------
* The model is XGBoost (notebook 09 winner). XGBoost is scale-invariant, so we
  feed the already-scaled selected features straight from test_selected.parquet.
* Nothing here fabricates data. The "live" stream is a timed replay of REAL
  held-out test rows the model never saw during training — see /api/stream.
* If the model/data assets are missing, the app still starts and reports
  health=false so the frontend can fall back to its design-time placeholder data.
"""

import os
import json
import asyncio
import random
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── asset locations ────────────────────────────────────────────────
# default: ../demo_assets relative to this file; override with DEMO_ASSETS env var
ASSETS = Path(os.environ.get(
    "DEMO_ASSETS",
    Path(__file__).resolve().parent.parent / "demo_assets",
))

MODEL_PATH    = ASSETS / "xgb_multi_best.json"
FEATURES_PATH = ASSETS / "feature_list.json"
LABELS_PATH   = ASSETS / "label_mapping.csv"
METRICS_PATH  = ASSETS / "comparison_metrics.json"
TEST_PATH     = ASSETS / "test_selected.parquet"

# ── global state, populated at startup ─────────────────────────────
STATE = {
    "model": None,
    "features": None,      # ordered list of the 47 feature names
    "labels": None,        # {int index -> class name}
    "metrics": None,       # parsed comparison_metrics.json
    "test_df": None,       # held-out flows for the replay stream
    "ready": False,
    "error": None,
}


def _load_labels(path: Path):
    """label_mapping.csv is `label,index` (name -> int). Return {int: name}."""
    df = pd.read_csv(path)
    # be tolerant about column names / order
    cols = [c.lower() for c in df.columns]
    df.columns = cols
    if "index" in cols and "label" in cols:
        return {int(r["index"]): str(r["label"]) for _, r in df.iterrows()}
    # fallback: first col names, second col indices
    a, b = df.columns[0], df.columns[1]
    return {int(r[b]): str(r[a]) for _, r in df.iterrows()}


def load_assets():
    """Load everything. Sets STATE['ready']; never raises (records error instead)."""
    try:
        import xgboost as xgb

        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"model not found: {MODEL_PATH}")

        model = xgb.XGBClassifier()
        model.load_model(str(MODEL_PATH))
        STATE["model"] = model

        STATE["labels"] = _load_labels(LABELS_PATH) if LABELS_PATH.exists() else None

        STATE["metrics"] = json.loads(METRICS_PATH.read_text()) \
            if METRICS_PATH.exists() else None

        if TEST_PATH.exists():
            STATE["test_df"] = pd.read_parquet(TEST_PATH)

        # The 47 selected features are derived from the test parquet — its column
        # order IS the order the model was trained on (the model has no stored
        # feature names; it relies on positional order). This is the authoritative
        # source. (feature_list.json from the FE stage holds the 58 PRE-selection
        # features under a different key, so we deliberately do not use it here.)
        LABEL_COLS = {"label_binary", "label_multi"}
        if STATE["test_df"] is not None:
            STATE["features"] = [c for c in STATE["test_df"].columns if c not in LABEL_COLS]

        # sanity: model must expect exactly this many features
        n_model = getattr(model, "n_features_in_", None)
        if n_model is not None and STATE["features"] is not None and n_model != len(STATE["features"]):
            raise ValueError(
                f"model expects {n_model} features but parquet has {len(STATE['features'])}")

        STATE["ready"] = STATE["model"] is not None and STATE["features"] is not None
        STATE["error"] = None
    except Exception as e:  # noqa: BLE001  — demo backend: surface, don't crash
        STATE["ready"] = False
        STATE["error"] = f"{type(e).__name__}: {e}"


app = FastAPI(title="NetShield AI demo backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # demo only — frontend served from file:// or localhost
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    load_assets()


# ── health ─────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {
        "ready": STATE["ready"],
        "error": STATE["error"],
        "n_features": len(STATE["features"]) if STATE["features"] else 0,
        "n_classes": len(STATE["labels"]) if STATE["labels"] else 0,
        "n_test_rows": int(len(STATE["test_df"])) if STATE["test_df"] is not None else 0,
        "model": "XGBoost (multi-class, CICIDS-2017)",
    }


# ── metrics (real numbers from notebook 09) ────────────────────────
@app.get("/api/metrics")
def metrics():
    """Return the real comparison metrics + a freshly computed confusion matrix."""
    if STATE["metrics"] is None and not STATE["ready"]:
        return {"available": False, "reason": STATE["error"] or "assets not loaded"}

    out = {"available": True, "comparison": STATE["metrics"]}

    # compute a real confusion matrix on a sample of the held-out test set
    if STATE["ready"] and STATE["test_df"] is not None:
        from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score

        df = STATE["test_df"]
        sample = df.sample(min(40000, len(df)), random_state=42)
        X = sample[STATE["features"]].values
        y = sample["label_multi"].values
        pred = STATE["model"].predict(X)

        k = len(STATE["labels"])
        names = [STATE["labels"][i] for i in range(k)]
        cm = confusion_matrix(y, pred, labels=list(range(k))).tolist()
        per_class = {
            names[i]: {
                "precision": float(precision_score(y, pred, labels=[i], average="macro", zero_division=0)),
                "recall":    float(recall_score(y, pred, labels=[i], average="macro", zero_division=0)),
                "f1":        float(f1_score(y, pred, labels=[i], average="macro", zero_division=0)),
                "support":   int((y == i).sum()),
            }
            for i in range(k)
        }
        out["confusion_matrix"] = {"labels": names, "matrix": cm, "n": int(len(sample))}
        out["per_class"] = per_class
        out["macro_f1"] = float(f1_score(y, pred, average="macro"))
        out["accuracy"] = float((pred == y).mean())

    return out


# ── feature importance (real, from the trained model) ──────────────
@app.get("/api/importance")
def importance():
    """Real global feature importance from the trained XGBoost model."""
    if not STATE["ready"]:
        return {"available": False, "reason": STATE["error"] or "model not loaded"}
    imp = STATE["model"].feature_importances_
    feats = STATE["features"]
    ranked = sorted(
        ({"feature": feats[i], "importance": float(imp[i])} for i in range(len(feats))),
        key=lambda d: d["importance"], reverse=True,
    )
    return {"available": True, "features": ranked}


# ── single / batch predict ─────────────────────────────────────────
class PredictRequest(BaseModel):
    flows: list[dict]          # each dict: {feature_name: value, ...}


@app.post("/api/predict")
def predict(req: PredictRequest):
    if not STATE["ready"]:
        return {"error": STATE["error"] or "model not loaded"}
    feats = STATE["features"]
    X = pd.DataFrame(req.flows).reindex(columns=feats, fill_value=0.0).values
    proba = STATE["model"].predict_proba(X)
    preds = proba.argmax(axis=1)
    return {
        "predictions": [
            {
                "class_index": int(p),
                "class_name": STATE["labels"][int(p)],
                "confidence": float(proba[i][p]),
                "proba": {STATE["labels"][j]: float(proba[i][j]) for j in range(proba.shape[1])},
            }
            for i, p in enumerate(preds)
        ]
    }


# ── live replay stream ─────────────────────────────────────────────
def _pick_rows(scenario: str, n: int):
    """Pick n test rows for the requested scenario (real held-out flows)."""
    df = STATE["test_df"]
    benign_idx = [i for i, name in STATE["labels"].items() if name.upper() == "BENIGN"]
    benign = benign_idx[0] if benign_idx else 0

    if scenario == "normal":
        pool = df[df["label_multi"] == benign]
    elif scenario == "attack":
        pool = df[df["label_multi"] != benign]
    elif scenario in (STATE["labels"][i] for i in STATE["labels"]):
        # a specific class name
        cls = [i for i, nm in STATE["labels"].items() if nm == scenario]
        pool = df[df["label_multi"] == cls[0]] if cls else df
    else:  # mixed — real-world-ish blend, mostly benign
        return df.sample(min(n, len(df)))
    if len(pool) == 0:
        pool = df
    return pool.sample(min(n, len(pool)), replace=len(pool) < n)


@app.websocket("/api/stream")
async def stream(ws: WebSocket):
    """
    Replay real held-out flows through the model as a timed feed.
    Client may send JSON {scenario: 'normal'|'attack'|'mixed'|<class>, rate: <flows/sec>}.
    """
    await ws.accept()
    if not STATE["ready"]:
        await ws.send_json({"type": "error", "message": STATE["error"] or "model not loaded"})
        await ws.close()
        return

    scenario = "mixed"
    rate = 6.0
    feats = STATE["features"]

    async def maybe_recv(timeout):
        nonlocal scenario, rate
        try:
            msg = await asyncio.wait_for(ws.receive_json(), timeout=timeout)
            scenario = msg.get("scenario", scenario)
            rate = float(msg.get("rate", rate))
        except (asyncio.TimeoutError, Exception):
            pass

    # apply the client's initial scenario/rate before the first flow (grace wait)
    await maybe_recv(timeout=0.5)

    try:
        while True:
            await maybe_recv(timeout=0.001)
            batch = _pick_rows(scenario, 1)
            row = batch.iloc[0]
            X = row[feats].values.reshape(1, -1)
            proba = STATE["model"].predict_proba(X)[0]
            p = int(proba.argmax())
            true_idx = int(row["label_multi"])
            await ws.send_json({
                "type": "flow",
                "pred_index": p,
                "pred_name": STATE["labels"][p],
                "true_index": true_idx,
                "true_name": STATE["labels"][true_idx],
                "correct": bool(p == true_idx),
                "confidence": float(proba[p]),
                "is_attack": STATE["labels"][p].upper() != "BENIGN",
            })
            await asyncio.sleep(max(0.02, 1.0 / max(rate, 0.5)))
    except WebSocketDisconnect:
        return
    except Exception as e:  # noqa: BLE001
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
