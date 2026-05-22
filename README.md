# Intrusion Detection on CICIDS-2017

End-to-end machine-learning pipeline for network intrusion detection on the
**CICIDS-2017** benchmark — from raw flow CSVs through cleaning, feature
engineering, dimensionality reduction, modelling, and a head-to-head against
production-grade library implementations. Both **binary** (BENIGN vs ATTACK)
and **multi-class** (7 attack families) classification.

Two models are implemented **from scratch in NumPy** (no
`sklearn.linear_model`, `torch`, or `tensorflow`):

- Binary logistic / multi-class softmax regression with mini-batch GD, L2,
  and class-weighted cross-entropy.
- Multi-layer perceptron with He initialisation, ReLU + dropout, and
  hand-derived backpropagation.

Two reference models (Random Forest, XGBoost-GPU) are then trained on the
same data so the from-scratch results have a production benchmark to be
measured against.

---

## Pipeline at a glance

```
Raw CSVs (2.83M rows, 79 features, 15 classes)
        │
        ▼
01  EDA                          —  data shape, missing, dupes, skew, correlations
        │
        ▼
02  Preprocessing                —  -256k duplicates, fix Inf/NaN, drop zero-var,
                                    drop |r|>0.95 redundancy, sentinel-aware
                                    negative handling, group 15 → 7 attack
                                    families, stratified 80/20 train/test split
        │
        ▼
03  Feature Engineering          —  log1p on highly-skewed features, +7 derived
                                    ratio / rate features, StandardScaler
                                    (fit on train only)
        │
        ▼
04  Feature Selection            —  Pearson + Spearman + Mutual Information vs
                                    both targets, inter-feature correlation
                                    pruning, SMOTE for binary AND multi-class
                                    on the selected feature space
        │
        ▼
05  Binary  — Scratch LR         —  baseline; logistic regression, NumPy
06  Multi   — Scratch Softmax LR —  baseline; softmax regression, NumPy
07  Binary  — Scratch MLP        —  proposed; non-linear, NumPy
08  Multi   — Scratch MLP        —  proposed; non-linear, NumPy
        │
        ▼
09  Comparison — RF + XGBoost(GPU) —  reference implementations
```

Numbers along the way:

| Stage | Rows | Features |
|---|---:|---:|
| Raw | 2,830,743 | 79 |
| After preprocessing | 2,574,264 | 49 |
| Train split (80%) | 2,059,411 | 49 |
| After feature engineering | 2,059,411 | 58 |
| After feature selection | 2,059,411 | 47 |
| Binary SMOTE train | 3,437,418 | 47 |
| Multi-class SMOTE train | 2,918,709 | 47 |

---

## Repository layout

```
ids-cicids2017/
├── notebooks/                              ← clean re-runnable templates
│   ├── 01_EDA.ipynb
│   ├── 02_Preprocessing.ipynb
│   ├── 03_FeatureEngineering.ipynb
│   ├── 04_FeatureSelection.ipynb
│   ├── 05_Modeling_Binary.ipynb              (scratch LR)
│   ├── 06_Modeling_Multiclass.ipynb          (scratch softmax LR)
│   ├── 07_Modeling_Binary_MLP.ipynb          (scratch MLP)
│   ├── 08_Modeling_Multiclass_MLP.ipynb      (scratch MLP)
│   ├── 09_Modeling_Comparison.ipynb          (RF + XGBoost reference)
│   ├── 10_Modeling_Hierarchical.ipynb        (two-stage cascade experiment)
│   ├── 11_Leakage_SanityCheck.ipynb          (negative-control leakage test)
│   ├── 12_Ablation_DestinationPort.ipynb     (feature-ablation test)
│   └── 13_Robustness_Perturbation.ipynb      (real-world robustness test)
└── outputs/                                ← rendered runs with embedded figures
    ├── 01_EDA_outputs.ipynb  …  09_Modeling_Comparison_outputs.ipynb
    ├── 10_Modeling_Hierarchical_outputs.ipynb
    ├── 11_Leakage_SanityCheck_outputs.ipynb
    ├── 12_Ablation_DestinationPort_outputs.ipynb
    └── 13_Robustness_Perturbation_outputs.ipynb
```

A full narrative write-up of the whole project — problem, approach, every
design decision, results, and validation — is in
[`PROJECT_REPORT.md`](PROJECT_REPORT.md).

The dataset itself is **not** in this repository — download it from the
Canadian Institute for Cybersecurity:
<https://www.unb.ca/cic/datasets/ids-2017.html>

---

## Headline results

### Binary task — BENIGN vs ATTACK

Test set: 514,853 rows, real-world distribution (no SMOTE on test).

| Model | F1 | Precision | Recall | ROC-AUC |
|---|---:|---:|---:|---:|
| Scratch Logistic Regression *(baseline)* | 0.9052 | 0.8501 | 0.9680 | 0.9932 |
| **Scratch MLP** | **0.9926** | 0.9892 | 0.9961 | 0.9999 |
| Random Forest *(reference)* | 0.9970 | 0.9948 | 0.9992 | 1.0000 |
| XGBoost *(reference, GPU)* | **0.9972** | 0.9949 | 0.9995 | 1.0000 |

### Multi-class task — 7 attack families

Test set: 514,853 rows, real-world distribution.

| Model | Macro-F1 | Weighted-F1 | Accuracy |
|---|---:|---:|---:|
| Scratch Softmax LR *(baseline)* | 0.7527 | 0.9798 | 0.9704 |
| **Scratch MLP** | **0.8439** | 0.9944 | 0.9924 |
| Random Forest *(reference)* | 0.9712 | 0.9987 | 0.9987 |
| XGBoost *(reference, GPU)* | **0.9722** | 0.9991 | 0.9990 |

### Per-class F1 (multi-class) — where the gap actually lives

The big classes are essentially solved by every model. The interesting story
is in the **rare classes**, where each step up the model ladder gives a
disproportionate lift.

| Class | Scratch LR | Scratch MLP | Random Forest | XGBoost |
|---|---:|---:|---:|---:|
| BENIGN | 0.9823 | 0.9955 | 0.9992 | **0.9994** |
| DDoS | 0.9966 | 0.9987 | **0.9998** | **0.9998** |
| DoS | 0.9571 | 0.9914 | 0.9981 | **0.9985** |
| PortScan | 0.9900 | 0.9934 | 0.9892 | **0.9939** |
| Brute Force | 0.8616 | 0.9685 | 0.9995 | **1.0000** |
| **Web Attack** | 0.4084 | 0.7306 | 0.9824 | **0.9859** |
| **Bot/Infiltration** | 0.0727 | 0.2291 | **0.8305** | 0.8279 |

The story in one sentence: **the from-scratch MLP closes ~75% of the
macro-F1 gap between the linear baseline and XGBoost** (LR 0.75 → MLP 0.84
→ XGB 0.97), despite being implemented in raw NumPy.

### When does SMOTE actually matter?

Every model was trained both with `class_weight='balanced'` (strategy A)
and on a SMOTE-balanced training set (strategy B). The pattern across the
four-model × two-task comparison:

| Imbalance regime | Verdict |
|---|---|
| Binary, ~5:1 imbalance | **No real difference** — pick the simpler option (class-weighting; no 394 MB SMOTE artifact, 40% faster training). |
| Multi-class, ~1000:1 imbalance, **linear / MLP models** | SMOTE wins by +0.06 – +0.09 macro-F1 — synthetic samples give the model boundaries to fit, where re-weighting alone breaks down. |
| Multi-class, ~1000:1 imbalance, **tree ensembles** | **Tie** — RF and XGBoost handle imbalance well internally; SMOTE doesn't add much. |

---

## Is the 99% real? — Validation & robustness

Scores above 95% warrant suspicion of data leakage, so we ran three
independent checks (notebooks 11–13). Two clean passes and one honest
weakness:

| Test | Question | Verdict |
|---|---|---|
| **Negative controls** (11) | Train/test harness leak? | ✅ **Clean** — shuffled-label and pure-noise data collapse to chance (macro-F1 ≈ 0.13 vs 0.14 floor) |
| **Destination-Port ablation** (12) | Riding on the known port-memorisation artifact? | ✅ **No** — removing it costs only −0.007 macro-F1; the model uses genuine flow behaviour |
| **Perturbation robustness** (13) | Real-world generalisation? | ⚠️ **Brittle to noise** (macro-F1 halves at σ=0.05), **robust to feature dropout** (80% retained at 20% missing) |

Bonus finding from the ablation: the `Init_Win_bytes` features (and the
`-1`-sentinel handling decided in preprocessing) are what make the rare
classes learnable — removing them collapses Bot/Infiltration (0.80 → 0.07)
and Web Attack (0.97 → 0.25).

We also tested a **two-stage cascade** (notebook 10): a BENIGN/ATTACK gate
feeding an attack-only specialist. It lifts the weaker MLP (+0.062 macro-F1
end-to-end) but slightly hurts XGBoost (−0.044), since a strong flat model
gains nothing from the extra error-prone gate.

Full details and honest caveats are in
[`PROJECT_REPORT.md`](PROJECT_REPORT.md) §4b–4c.

---

## How to run

Notebooks are designed for **Kaggle** (chosen after Colab couldn't fit the
3.4M-row SMOTE step in RAM). To reproduce:

1. Upload the raw `MachineLearningCSV.zip` to Kaggle as a dataset.
2. Run `01_EDA.ipynb` and `02_Preprocessing.ipynb` (Colab or Kaggle — both
   work; these only mount Google Drive on Colab). Output of (02) goes into
   a new Kaggle dataset.
3. Run `03_FeatureEngineering.ipynb` on Kaggle — attach the preprocessing
   output. Save its output as a new dataset.
4. Run `04_FeatureSelection.ipynb` on Kaggle — attach the FE output. This
   produces *both* `train_binary_smote_selected.parquet` and
   `train_multi_smote_selected.parquet`, so it never needs re-running.
5. Run notebooks `05` – `08` on Kaggle — each attaches the FeatureSelection
   output dataset.
6. Run `09_Modeling_Comparison.ipynb` on Kaggle with **GPU accelerator
   enabled** — XGBoost runs with `tree_method='hist', device='cuda'` and is
   ~35× faster on GPU than Random Forest on CPU.

Each notebook's top cell has an `IN_DIR` (or `PROJECT_DIR`) constant —
point it at the mount path Kaggle shows in the **Input** panel for the
dataset you attached.

---

## Design choices worth flagging

- **Init_Win_bytes sentinel.** CICIDS-2017 uses `-1` to mean "no TCP window
  observed" (e.g. non-TCP flows). Preprocessing preserves the `-1` as a
  distinct category and adds binary `has_init_win_*` flags rather than
  clipping it to 0 — the flags turn out to be among the strongest features
  in the binary scratch model.
- **15 classes → 7 attack families.** Heartbleed (11 rows), SQL Injection
  (21 rows), Infiltration (36 rows) are unlearnable after a train/test
  split. Grouping by attack family (e.g. all DoS variants together)
  preserves semantic meaning instead of a meaningless "Other" bucket.
- **SMOTE lives in feature-selection, not feature-engineering.** SMOTE
  interpolates between samples, so it belongs in the *final* feature space
  — after redundant columns are removed. Doing it here also keeps the
  oversampled file column-consistent with the rest of the data
  (47 features), so the modelling notebooks need only one input dataset.
- **Multi-class SMOTE is capped, not equalised.** Lifting Web Attack
  (1.7k rows) up to BENIGN's ~1.7M would make it 99.9% synthetic — every
  minority class is capped at 200k rows instead.
- **Feature selection at |r| > 0.95.** Preprocessing already cut redundancy
  at this threshold; this second pass at the same threshold caught 15 new
  pairs because log1p transformation in feature engineering *changed* the
  correlation structure. The redundancy-only strategy never drops a feature
  for being merely weak — only for being redundant with a stronger one.
- **Reference models are *not* competitors.** RF and XGBoost exist to give
  the from-scratch numbers a benchmark. The methodological baseline is the
  scratch LR — that's the model whose limitations the scratch MLP was
  designed to overcome.

---

## Dataset citation

> Iman Sharafaldin, Arash Habibi Lashkari, Ali A. Ghorbani, "Toward
> Generating a New Intrusion Detection Dataset and Intrusion Traffic
> Characterization", *4th International Conference on Information Systems
> Security and Privacy* (ICISSP), Portugal, January 2018.
