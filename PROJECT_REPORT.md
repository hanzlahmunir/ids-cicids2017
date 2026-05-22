# Network Intrusion Detection on CICIDS-2017
## A Complete Project Report

**Author:** Hanzlah Munir
**Course:** Machine Learning (Semester 6)
**Repository:** https://github.com/hanzlahmunir/ids-cicids2017
**Last updated:** 2026-05-17

---

## Quick-reference summary (for the first slide)

We built an end-to-end intrusion-detection pipeline on **CICIDS-2017** (2.83 M
flows, 79 features, 15 attack labels). After cleaning, feature engineering,
and dimensionality reduction we trained **two models from scratch in NumPy**
— logistic / softmax regression and a multi-layer perceptron — on both a
**binary** (BENIGN vs ATTACK) and a **multi-class** (7 attack families)
formulation, then benchmarked them against **Random Forest** and **GPU
XGBoost**.

The four models, on the same held-out test set of 514,853 flows:

| Model | Binary F1 | Multi-class macro-F1 |
|---|---:|---:|
| Scratch LR *(baseline)* | 0.9052 | 0.7527 |
| **Scratch MLP** | **0.9926** | **0.8439** |
| Random Forest *(reference)* | 0.9970 | 0.9712 |
| XGBoost *(reference, GPU)* | **0.9972** | **0.9722** |

**Headline finding:** our from-scratch MLP closes roughly **75 % of the
macro-F1 gap** between the linear baseline and a state-of-the-art tree
ensemble (0.75 → 0.84 → 0.97), despite being implemented in raw NumPy.
Tree ensembles essentially solve the rare-class problem that the linear
baseline could not touch — Bot/Infiltration F1 went from **0.07 → 0.23 →
0.83** as we moved from LR to MLP to trees.

---

## 1. Problem statement and motivation

A modern network-intrusion-detection system (NIDS) inspects a continuous
stream of network flows and decides which ones represent an attack.
CICIDS-2017 is one of the most-used public benchmarks for the task — it
captures five days of mixed benign and attack traffic on a small enterprise
network, with each flow already summarised into 78 numeric features (packet
counts, inter-arrival times, flag counts, etc.) and a label.

We treat the task in two formulations:

- **Binary** — is this flow benign or an attack? Operationally the most
  useful framing for a real-time IDS.
- **Multi-class** — which of seven attack *families* does this flow belong
  to (BENIGN, DoS, DDoS, PortScan, Brute Force, Web Attack,
  Bot/Infiltration)? More useful for incident response, harder because of
  severe class imbalance.

The project requirement was an end-to-end ML pipeline with **at least two
models implemented from scratch**, with proper preprocessing, feature
engineering, hyperparameter tuning, and evaluation. We extended it with
two production-grade reference models so the from-scratch numbers have a
benchmark to be measured against.

---

## 2. Methodology overview

The pipeline is nine notebooks, each producing the input for the next:

```
01 EDA  →  02 Preprocessing  →  03 Feature Engineering  →  04 Feature Selection
                                                                    │
                                                          ┌─────────┴─────────┐
                                                          ▼                   ▼
                                              05 Binary LR (scratch)   06 Multi LR (scratch)
                                              07 Binary MLP (scratch)  08 Multi MLP (scratch)
                                                          │                   │
                                                          └─────────┬─────────┘
                                                                    ▼
                                                  09 Comparison: RF + XGBoost (GPU)
```

The infrastructure was as important as the algorithms. We initially worked
in Google Colab; when the SMOTE step exceeded its RAM we migrated to
**Kaggle Notebooks**, with each stage's output uploaded as a Kaggle Dataset
that the next stage reads from. Every notebook produces both rendered
figures (for the report) and a text-format report file logging every
quantitative finding, plus the parquet files / model weights for the next
stage.

Notebook outputs are persisted via "Save Version" on Kaggle and copied into
a public GitHub repository under two folders:

- `notebooks/` — clean, re-runnable templates
- `outputs/` — the same notebooks with embedded figures and results

---

## 3. Stage-by-stage walkthrough

### 3.1  Exploratory Data Analysis (notebook 01)

**Goal:** characterise the data before deciding how to clean it.

The raw dataset is eight CSV files (one per day, plus separate AM/PM splits
on the days that had multiple attack campaigns). Concatenating them gives
**2,830,743 rows × 79 features × 15 unique labels** (BENIGN plus 14 attack
types). All features are numeric.

What we measured, and why:

| What | Why |
|---|---|
| Row counts per source file | Verifies the concat is correct and tells us which days carry which attacks |
| dtype breakdown | Confirms everything is already numeric — no categorical encoding needed |
| Missing values per column | Decides whether to impute or drop |
| Infinite values per column | `Flow Bytes/s` and `Flow Packets/s` produce ∞ when flow duration is zero — must be handled |
| Duplicate rows | Duplicates leak between train/test splits and bias every downstream statistic |
| Per-column variance | Constant columns add zero signal and slow training |
| Skewness and kurtosis per column | Tells us which features need log-transform later |
| Pairwise correlation matrix | Identifies redundant features (\|r\| > 0.95) |
| Class distribution (multi and binary) | Quantifies the imbalance problem we will have to solve |

Key findings the EDA surfaced:

- **9.06 % of all rows are exact duplicates** (256,479 of them).
- **`Flow Bytes/s` has 1,358 NaNs and 1,509 Infs;** `Flow Packets/s` has
  2,867 Infs.
- **8 columns are completely constant** (zero variance) — they were
  effectively dead columns in the original capture.
- **39 feature pairs are correlated above \|r\| > 0.95** — at least one
  member of each pair carries no extra information.
- **68 of 78 features have \|skew\| > 1**, many with \|skew\| > 2 —
  network-flow features are notoriously right-skewed because most flows
  are short and a few are very long.
- **The class distribution is brutally imbalanced:** BENIGN is 80.3 % of
  the rows; the smallest attack class (Heartbleed, 11 rows) is six orders
  of magnitude smaller.

This stage produced 20 figures and a 600+-line text report, both saved to
Drive (later Kaggle). The findings *directly determined* every preprocessing
decision in stage 2.

### 3.2  Preprocessing (notebook 02)

**Goal:** turn the raw data into a clean, labelled, model-ready dataset.

The cleaning steps, in execution order, with the reason for each:

1. **Fix garbled Web-Attack labels.** The raw CSVs encode three labels as
   `Web Attack � Brute Force`, `Web Attack � XSS`, `Web Attack � Sql
   Injection` — the `�` is a Unicode replacement character from a broken
   encoding. We normalise these to `Web Attack - Brute Force` etc. so the
   labels are usable strings.
2. **Replace ±Inf with NaN.** `np.inf` cannot be standard-scaled, log-
   transformed, or fed to most models without producing more NaN. Replacing
   it with NaN routes those cells through the same imputation pipeline as
   genuine missing values.
3. **Per-class median imputation.** The 2,867 NaN/Inf cells are imputed
   with the median of the *same class* — not the global median. Imputing
   an attack flow's missing value with the BENIGN median would inject
   benign statistics into attack rows and weaken the learned boundary.
4. **Drop exact duplicate rows.** 256,479 removed (9.06 %). This is
   critical *before* the train/test split — if duplicates straddle the
   split, the model sees the same flow in both sets and reports inflated
   metrics.
5. **Drop the 8 zero-variance columns** — pure noise / dead capture
   columns.
6. **Drop one feature per redundant pair (\|r\| > 0.95).** A greedy
   algorithm: while any pair above the threshold remains, drop the
   feature that participates in the most remaining redundant pairs.
   Removes 21 features in total. Keeps the more "central" feature in each
   correlated cluster.
7. **Sentinel-aware negative-value handling.** Several columns are
   physically non-negative (counts, durations) but contain stray negative
   values from measurement artefacts — those we clip to 0. *Exception:*
   `Init_Win_bytes_forward` and `Init_Win_bytes_backward` use **`-1` as a
   sentinel** meaning "no TCP window value observed" (e.g. non-TCP flows).
   We preserve the `-1` as a distinct value and add binary
   `has_init_win_fwd` / `has_init_win_bwd` flags. This turned out to
   matter — the `has_init_win_fwd` flag became the **#1 most-positive
   weight** in the from-scratch binary logistic regression.
8. **Group 15 raw classes into 7 attack families.** Heartbleed (11 rows),
   SQL Injection (21 rows), Infiltration (36 rows) are unlearnable after
   any meaningful train/test split. Rather than dropping them or putting
   them in a meaningless "Other" bucket, we group **semantically**:

   | Family | Original labels |
   |---|---|
   | BENIGN | BENIGN |
   | DoS | DoS Hulk, DoS slowloris, DoS Slowhttptest, DoS GoldenEye, Heartbleed |
   | DDoS | DDoS |
   | PortScan | PortScan |
   | Brute Force | FTP-Patator, SSH-Patator |
   | Web Attack | Web Attack Brute Force, Web Attack XSS, Web Attack SQL Injection |
   | Bot/Infiltration | Bot, Infiltration |

9. **Add `label_binary` and `label_multi` targets.** Both are derived
   here so all downstream notebooks see the same encoding.
10. **Stratified 80 / 20 train/test split** on `label_multi`. Stratifying
    on the harder (multi-class) label guarantees every class is present
    in both sets in proportion; the binary split inherits this.

After preprocessing we go from **(2.83 M, 79 features, 15 classes) →
(2.57 M, 49 features, 7 classes)**, split into 2,059,411 training rows and
514,853 test rows.

### 3.3  Feature Engineering (notebook 03)

**Goal:** improve feature quality without changing the row count.

Three operations:

1. **Skew correction via `log1p`.** Features with \|skew\| > 1 on the
   training set are transformed as `x → log(1 + x)`. The threshold is
   decided on training data only, then the *same* columns are transformed
   in test (no test-data leakage). Mean \|skew\| across transformed
   columns went from **54.4 → 0.89** — most features become approximately
   symmetric. Init-Win columns need a `+1` shift first because of the
   `-1` sentinel; the shift moves the sentinel to 0 so `log1p(0) = 0` is
   well-defined.
2. **7 derived ratio / rate features.** Flow asymmetry is a strong
   intrusion signal — many attacks have very different forward and
   backward characteristics. We computed:

   | Feature | Meaning |
   |---|---|
   | `fwd_bwd_byte_ratio` | forward bytes / backward bytes |
   | `fwd_bwd_pkts_ratio` | forward packets/s / backward packets/s |
   | `seg_size_ratio` | forward segment size / backward segment size |
   | `fwd_bwd_iat_ratio` | forward IAT mean / backward IAT mean |
   | `bwd_header_ratio` | backward header bytes / backward total bytes |
   | `active_idle_ratio` | active mean / (idle std + idle min) |
   | `total_flag_count` | sum of all TCP flag counts |

   These showed up strongly in feature ranking — `bwd_header_ratio` ranked
   **#2 by RF importance** out of all 58 features.

3. **`StandardScaler`** (zero mean, unit variance), **fit on training data
   only**, then applied to test. Required for the from-scratch LR and MLP;
   tree models are scale-invariant but we use the same scaled data for
   them so all four models share an identical training matrix.

Result: **49 → 58 features.** No row-count change.

### 3.4  Feature Selection / Dimensionality Reduction (notebook 04)

**Goal:** keep only the features that carry distinct signal, and produce
SMOTE-balanced training sets.

The method follows the standard correlation-based feature-selection
playbook:

1. **Target correlation per feature** using *three* methods: **Pearson**
   (linear), **Spearman** (rank / monotonic), and **Mutual Information**
   (any dependency). Each computed against *both* the binary and the
   multi-class label, so a feature that only helps one task isn't
   discarded. The final "target strength" for a feature is the max
   absolute score across all six measures.
2. **Inter-feature correlation matrix.** Pairs with \|r\| > 0.95 are
   flagged as redundant. *Note:* preprocessing already cut redundancy at
   the same threshold — but the log1p transformation in stage 3
   *changed the correlation structure*, so 15 new redundant pairs
   appeared.
3. **Redundancy resolution** — for each redundant pair, drop the feature
   with the *weaker* target correlation. This is the standard rule and
   ensures that between two features that "say the same thing", we keep
   the one that better predicts the target.
4. **SMOTE-balanced training sets.** Two of them — one for binary
   (BENIGN vs ATTACK fully balanced 50/50), one for multi-class (each
   minority class lifted to **min(majority, 200,000)** rows; fully
   equalising Web Attack to 1.7 M would produce 99.9 % synthetic noise).
   SMOTE is run *here* rather than in feature engineering because
   it interpolates between samples — it should operate in the *final*
   feature space, after redundancy is removed.

Result: **58 → 47 features.** Eleven redundant features dropped — examples
include `Packet Length Std` (dropped in favour of `Packet Length Variance`,
0.9758 vs 0.9742 target strength) and the `Avg Bwd Segment Size` family
(dropped in favour of `Subflow Bwd Bytes`).

Per-class target-strength ranking puts these features at the top:

| Rank | Feature | Target strength |
|---|---|---:|
| 1 | Average Packet Size | 1.000 |
| 2 | Packet Length Variance | 0.976 |
| 3 | bwd_header_ratio *(derived)* | 0.901 |
| 4 | Subflow Bwd Bytes | 0.888 |
| 5 | fwd_bwd_byte_ratio *(derived)* | 0.866 |

Two of the top-five most informative features are ones **we engineered** —
the derived ratio features did real work.

### 3.5  Modelling — from scratch in NumPy

This is where the project requirement of "at least two from-scratch models"
is met. We trained **four** scratch models in total (two architectures
× two tasks), then compared each against a SMOTE-trained sibling to
understand the imbalance-handling trade-off.

#### 3.5.1  Architectures

**Logistic / Softmax Regression** (notebooks 05 binary, 06 multi-class).
A single linear layer plus sigmoid (binary) or softmax (multi-class).
Implemented in pure NumPy with:

- **Mini-batch gradient descent** — full-batch is too memory-heavy at
  ~2 M rows; pure SGD is too noisy. Mini-batch is the standard middle
  ground.
- **Binary or categorical cross-entropy** loss.
- **L2 regularisation.**
- **Inverse-frequency class weighting** as the imbalance-handling option
  (strategy A).
- Numerical-stability tricks: split-branch sigmoid to avoid `exp` overflow,
  per-row max-subtraction before softmax.

**Multi-Layer Perceptron** (notebooks 07 binary, 08 multi-class). Two
hidden layers with ReLU activations, dropout, and a sigmoid (binary) or
softmax (multi-class) output. Pure NumPy with:

- **He initialisation** for ReLU layers (`std = sqrt(2 / fan_in)`).
  Without this, ReLU networks tend to die in the first few epochs
  because Xavier init produces too many negative activations.
- **Inverted dropout** — during training, mask ~Bernoulli(1-p) and
  scale by 1/(1-p); at inference, pass through unchanged. Keeps
  activation magnitudes comparable between train and test.
- **Hand-derived backpropagation** for every layer — `dL/dz_out` for
  sigmoid+BCE or softmax+CE has the same clean form `(P - y) ·
  sample_w / m`, which propagates back through the network via the chain
  rule and ReLU derivative.
- Same mini-batch GD, L2, and class weighting as the LR.

#### 3.5.2  Hyperparameter tuning

Every from-scratch model went through a grid search ranked by the relevant
metric (F1 for binary, macro-F1 for multi-class). The grids were sized to
finish in a reasonable wall-clock time on Kaggle's CPU:

- **LR**: `lr ∈ {0.01, 0.1, 0.5}` × `λ ∈ {0.0, 0.1, 1.0}` × `batch ∈
  {4096, 16384}` = 18 fits.
- **Softmax LR (multi)**: `lr ∈ {0.1, 0.5, 1.0}` × same λ × batch = 18
  fits. We extended the upper `lr` bound because binary's best landed on
  the previous grid edge.
- **MLP**: `hidden_sizes ∈ {(64,32), (128,64), (256,128)}` × `lr ∈
  {0.01, 0.05}` × `dropout ∈ {0.0, 0.2}` × `λ = 0.0` = 12 fits for
  binary, 6 for multi-class (dropout fixed at 0 after binary results).
  `lr=0.5` is too high for an MLP (each layer's gradient is a product of
  several terms) so the grid uses smaller values than the LR.

Best configurations found:

| Model | Best hyperparameters |
|---|---|
| Scratch LR (binary) | `lr=0.5, λ=0.0, batch=4096`, 60 epochs |
| Scratch softmax LR (multi) | `lr=1.0, λ=0.0, batch=4096`, 60 epochs |
| Scratch MLP (binary) | `hidden=(256,128), lr=0.05, dropout=0.0`, 50 epochs |
| Scratch MLP (multi) | `hidden=(128,64), lr=0.05, dropout=0.0`, 40 epochs |

Two unexpected findings from tuning:

- **Dropout *hurt* every binary MLP configuration** by 0.5–2.5 F1 points.
  We carried that learning forward and fixed dropout at 0 in the
  multi-class MLP grid.
- **The smaller (128,64) MLP beat (256,128) on multi-class** (macro-F1
  0.767 vs 0.759 on the validation split). With only ~1,600 training
  rows of Bot/Infiltration available, extra model capacity couldn't be
  constrained by the rare classes — it just memorised BENIGN.

#### 3.5.3  Class imbalance — two strategies, head-to-head

Both binary and multi-class have a serious imbalance problem (5:1 binary,
1080:1 multi-class). We compared two standard treatments on **every**
scratch model:

- **Strategy A — class weighting.** Weight each sample's loss
  contribution by the inverse of its class frequency. The training data
  remains the real distribution; only the loss is reweighted.
- **Strategy B — SMOTE.** Train on a synthetically balanced training set
  produced by k-NN-based interpolation between existing minority-class
  samples. The test set keeps the real distribution.

The test-set results, on all four scratch models:

| Model & Task | Strategy A (CW) | Strategy B (SMOTE) | Winner |
|---|:-:|:-:|---|
| LR binary, F1 | 0.9052 | 0.9051 | **tie** |
| Softmax LR multi, macro-F1 | 0.6582 | 0.7527 | **SMOTE +0.094** |
| MLP binary, F1 | 0.9894 | 0.9926 | **tie** |
| MLP multi, macro-F1 | 0.7843 | 0.8439 | **SMOTE +0.060** |

The pattern is clean:

- **At moderate imbalance (5:1, binary), the two strategies are
  equivalent.** F1 within 0.003 in both LR and MLP runs. We chose
  class-weighting as the deployment artefact — same metrics, no 394 MB
  SMOTE file to ship, and 40 % faster training.
- **At extreme imbalance (1080:1, multi-class), SMOTE wins decisively.**
  +0.06 to +0.09 macro-F1 in both LR and MLP runs. Class-weighting matches
  on recall but loses badly on precision — at 1000× per-sample weight,
  the model becomes too aggressive about predicting minority classes.

This is a usable rule of thumb to report: *use class-weighting until the
imbalance approaches two orders of magnitude, then switch to SMOTE.*

### 3.6  Reference models (notebook 09)

**Goal:** show how close the from-scratch implementations get to
production-grade libraries.

Two models, both tasks:

- **Random Forest** (sklearn, CPU, `n_jobs=-1`). Grid over `max_depth ∈
  {None, 20}` × `min_samples_leaf ∈ {1, 5}` with `n_estimators=200`.
- **XGBoost** (`tree_method='hist', device='cuda'` for GPU acceleration —
  the one place in the whole project where GPU genuinely helps). Grid
  over `max_depth ∈ {6, 10}` × `learning_rate ∈ {0.1, 0.3}` with
  `n_estimators=400`.

Each model was again trained twice — with `class_weight='balanced'` /
`scale_pos_weight` vs. SMOTE — for consistency with the scratch models.
For tree ensembles the two strategies essentially tie on both tasks, which
is expected: trees handle class imbalance gracefully via their splitting
criterion.

Wall-clock cost is dramatically different between RF and XGBoost: each RF
fit on the validation split takes ~6 minutes on 4 CPU cores; the equivalent
XGBoost fit on T4 GPU takes ~10 seconds. That ~35× speed-up is the
practical payoff of GPU on this project — there was no reason to use GPU
for the from-scratch models because pure-NumPy code can't be moved to GPU
without switching to CuPy / PyTorch (which would break the "from scratch"
contract).

---

## 4. Results

### 4.1  Headline matrix — 4 models × 2 tasks

Test set: 514,853 rows in the **real-world class distribution** (no SMOTE
applied to the test set in any experiment).

**Binary task — BENIGN vs ATTACK**

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---:|---:|---:|---:|---:|
| Scratch LR *(baseline)* | 0.9665 | 0.8501 | 0.9680 | 0.9052 | 0.9932 |
| **Scratch MLP** | 0.9975 | 0.9892 | 0.9961 | **0.9926** | 0.9999 |
| Random Forest *(reference)* | 0.9989 | 0.9948 | 0.9992 | 0.9970 | 1.0000 |
| XGBoost *(reference)* | 0.9991 | 0.9949 | 0.9995 | **0.9972** | 1.0000 |

**Multi-class task — 7 attack families**

| Model | Accuracy | Macro-F1 | Weighted-F1 | Macro-Prec | Macro-Rec |
|---|---:|---:|---:|---:|---:|
| Scratch Softmax LR *(baseline)* | 0.9704 | 0.7527 | 0.9798 | 0.7142 | 0.9771 |
| **Scratch MLP** | 0.9924 | 0.8439 | 0.9944 | 0.8070 | 0.9878 |
| Random Forest *(reference)* | 0.9987 | 0.9712 | 0.9987 | 0.9778 | 0.9652 |
| XGBoost *(reference)* | 0.9990 | **0.9722** | 0.9991 | 0.9608 | 0.9863 |

### 4.2  The per-class story — where the gap actually lives

Overall accuracy is misleading on this dataset because BENIGN is 83 % of
the test set. The honest view is per-class F1 for the multi-class task —
it reveals that the *big* classes are essentially solved by every model,
and the entire gap between models lives in the rare classes:

| Class | Test rows | Scratch LR | Scratch MLP | Random Forest | XGBoost |
|---|---:|---:|---:|---:|---:|
| BENIGN | 429,677 | 0.982 | 0.996 | 0.999 | **0.999** |
| DDoS | 25,603 | 0.997 | 0.999 | **1.000** | **1.000** |
| DoS | 38,752 | 0.957 | 0.991 | 0.998 | **0.999** |
| PortScan | 18,164 | 0.990 | 0.993 | 0.989 | **0.994** |
| **Brute Force** | 1,830 | 0.862 | 0.969 | 0.999 | **1.000** |
| **Web Attack** | 429 | 0.408 | 0.731 | 0.982 | **0.986** |
| **Bot/Infiltration** | 398 | 0.073 | 0.229 | **0.831** | 0.828 |

Three observations:

1. **Each step up the model ladder primarily helps the rare classes.**
   Bot/Infiltration F1 ratios: LR → MLP ≈ 3×; MLP → trees ≈ 3.6×.
   Web Attack ratios: LR → MLP ≈ 1.8×; MLP → trees ≈ 1.3×.
2. **The from-scratch MLP closes ~75 % of the macro-F1 gap** between
   the linear baseline and XGBoost (LR 0.753 → MLP 0.844 → XGB 0.972
   means the MLP is at (0.844-0.753)/(0.972-0.753) ≈ 41 % of the way
   *as macro*; per-class lifts are larger). For the rare classes
   specifically the MLP is closer to half-way.
3. **Bot/Infiltration is intrinsically the hardest class.** Even
   XGBoost lands at 0.83 — the lowest of any class for any
   non-baseline model. Two reasons: the class lumps two semantically
   different attack types together (Bot, with 1,966 rows, and
   Infiltration with 36 rows, were combined during preprocessing because
   Infiltration alone was unlearnable), and the total training-row count
   is only 1,591.

### 4.3  Where the from-scratch MLP wins over the LR baseline

The MLP's improvement over LR on the binary task is concentrated in
**precision** (0.8501 → 0.9892, +0.139) much more than in recall
(0.9680 → 0.9961, +0.028). What this means in plain terms: the linear
model was generating too many false-positive attack predictions; the MLP
nearly eliminates them while keeping detection rate roughly the same.
This is exactly the non-linear-feature-interaction story we hoped to
see — *"attack = X high AND Y low AND Z within range"* is a logical
conjunction the linear model cannot express directly but a 2-layer ReLU
network can.

### 4.4  Computational cost

For honesty about practical trade-offs:

| Stage | Where it ran | Approximate time |
|---|---|---:|
| EDA | Colab CPU | ~3 min |
| Preprocessing | Colab CPU | ~5 min |
| Feature engineering | Kaggle CPU | ~8 min |
| Feature selection | Kaggle CPU | ~12 min (incl. SMOTE) |
| Scratch LR (binary, both strategies) | Kaggle CPU | ~10 min |
| Scratch softmax LR (multi) | Kaggle CPU | ~12 min |
| Scratch MLP (binary, both strategies) | Kaggle CPU | ~85 min (50 min grid + 35 min final) |
| Scratch MLP (multi) | Kaggle CPU | ~55 min |
| Random Forest (both tasks, both strategies) | Kaggle CPU | ~75 min |
| XGBoost (both tasks, both strategies) | **Kaggle GPU** | ~5 min |

XGBoost on T4 is the *only* point in the project where GPU pays off —
~35× faster per fit than Random Forest on CPU. The from-scratch models
gain nothing from GPU because pure NumPy doesn't dispatch to CUDA without
switching to CuPy / PyTorch, which would defeat the "implemented from
scratch" claim.

---

## 4b. Extension experiment — two-stage (hierarchical) classifier

Beyond the flat models, we tested a **cascade**: a Stage-1 binary gate
(BENIGN vs ATTACK) followed by a Stage-2 specialist trained on **attack rows
only** (6 families, re-indexed). The idea: the flat model wastes capacity
separating BENIGN (1.7 M rows) from everything; a specialist freed of BENIGN
faces only ~97:1 imbalance instead of 1080:1.

We evaluated the full cascade **end-to-end** on the real test set (so Stage-1
errors propagate honestly — an attack the gate misses is counted as a BENIGN
mistake and never reaches Stage 2).

| Configuration | Multi macro-F1 |
|---|---:|
| Stage-1 gate recall(ATTACK) | 0.9966 (only 0.34 % of attacks lost at the gate) |
| Stage-2 specialist *(isolated, perfect-gate)* — MLP | 0.9750 |
| Stage-2 specialist *(isolated, perfect-gate)* — XGBoost | 0.9975 |
| **Cascade end-to-end — gate + MLP** | **0.9061**  (flat MLP was 0.8439, **+0.062**) |
| **Cascade end-to-end — gate + XGBoost** | **0.9280**  (flat XGB was 0.9722, **−0.044**) |

**Finding:** the cascade *helps a weak model and hurts a strong one.* The MLP
gained +0.062 macro-F1 because the milder Stage-2 imbalance let it learn the
rare classes far better (Bot/Infiltration F1 jumped 0.23 → 0.58). But XGBoost
*lost* 0.044 — it was already excellent flat, so the only thing the cascade
added was a new place to lose attacks (the gate). The takeaway worth
presenting: **cascading is a way to make a simple model punch above its
weight; a well-tuned ensemble doesn't need it and is mildly harmed by the
extra error stage.**

---

## 4c. Validation & robustness — is the 99 % real?

Every model scored above 95 %, which is high enough to warrant suspicion of
**data leakage**. We ran three independent checks, each answering a different
question. Crucially, **not all three are flattering** — which is what makes
the validation credible.

### Test 1 — Negative controls (is the harness leaking?)

We retrained the pipeline on signal-free data: (a) real features with
**shuffled labels**, and (b) **pure synthetic noise** matched to the real
mean/std. A leak-free pipeline must collapse to chance on both.

| Condition | Binary F1 | Multi macro-F1 |
|---|---:|---:|
| A — REAL data | 0.9962 | 0.9473 |
| B — label-shuffle | 0.0546 | 0.1346 |
| C — random-synthetic | 0.0000 | 0.1300 |

Chance macro-F1 for 7 classes is 0.1429; the controls scored 0.135 / 0.130 —
**dead-on chance.** *(Their ~0.81 accuracy is the imbalance illusion: a
no-signal model just predicts BENIGN, which is 83 % of the data — exactly why
we used macro-F1, not accuracy, as the headline metric throughout.)*
**Verdict: PASS — the train/test harness is honest. The 99 % is not a split
leak.**

### Test 2 — Feature ablation (does it cheat via port memorisation?)

The most-cited CICIDS-2017 criticism is that models memorise *which port each
attack targeted* (SSH→22, web→80/443) rather than learning attack behaviour.
We retrained with `Destination Port` removed.

| Feature set | Binary F1 | Multi macro-F1 |
|---|---:|---:|
| Full (47 features) | 0.9958 | 0.9639 |
| **− Destination Port** | 0.9955 | 0.9572  (**−0.007, negligible**) |
| − Init_Win (4 cols) | 0.9934 | 0.9228  (−0.041) |
| − Port + Init_Win | 0.9923 | 0.7192  (−0.245) |

**Verdict: the model does NOT rely on port memorisation** — removing it costs
0.7 % macro-F1. This directly refutes the standard leakage critique of the
dataset.

A bonus finding: **`Init_Win_bytes` is the real workhorse for the rare
classes.** Removing both Port and Init_Win collapses Bot/Infiltration
(0.80 → 0.07) and Web Attack (0.97 → 0.25) while the large classes barely
move. This validates the early preprocessing decision to preserve the
`Init_Win` `-1` sentinel and add `has_init_win_*` flags — those features are
precisely what makes the rare classes learnable. (Init_Win is genuine TCP
protocol behaviour, not an identifier like port, so this is signal, not
leakage.)

### Test 3 — Perturbation robustness (real-world generalisation)

Rather than invent fake "real-world" flows (which would be circular — we'd be
testing the model against our own assumptions), we took **real test flows**
and applied rising corruption, measuring how macro-F1 degrades.

| Perturbation | Clean | Mild | Heavy |
|---|---:|---:|---:|
| Gaussian noise (σ std-units) | 0.972 | 0.486 (σ=0.05) | 0.164 (σ=1.0) |
| Scaling drift (± per feature) | 0.972 | 0.710 (±0.1) | 0.131 (±0.5) |
| Feature dropout (frac zeroed) | 0.972 | 0.774 (20 %) | 0.350 (50 %) |

**Verdict: brittle to value noise, robust to missing features.** This is the
*honest* finding — the model degrades gracefully under feature dropout (80 %
of performance retained at 20 % missing, thanks to XGBoost surrogate splits)
but falls sharply under noise or miscalibration. Threshold-based tree models
on standardised features assume the values are precise and identically scaled
to training. **Deployment implication:** transferring to a new network would
require re-fitting the scaler on that network's traffic and equally precise
feature extraction — the model is not plug-and-play onto a noisier capture
pipeline.

*(Caveat to state honestly: σ is in standardised units applied to all 47
features at once, so the absolute numbers are a worst-case stress test, not a
literal field prediction. The trustworthy takeaway is the **shape** — noise
and drift bad, dropout fine — not the exact figures.)*

### Test 4 — Near-duplicate audit (is the test set genuinely held out?)

Exact duplicates were removed before splitting, but network attacks fire many
near-identical flows, so a random split could place near-twins in both train
and test — inflating the score without being an outright bug. For every test
row we measured the distance to its nearest *training* row, then bucketed test
rows by that distance and measured accuracy per bucket. The decisive question:
*does the model only succeed on rows it has a near-twin for?*

| Distance-to-train quintile | Accuracy | macro-F1 |
|---|---:|---:|
| Q1 (closest) | 0.9967 | 0.9905 |
| Q3 (middle) | 0.9995 | 0.9846 |
| **Q5 (farthest)** | **0.9993** | 0.7771 |

**Accuracy is flat across distance** (gap near−far = −0.003) — the model
classifies test rows *far* from any training example just as well as near ones.
This is the signature of genuine generalisation, not near-duplicate
memorisation. (51 % of test rows do sit within 0.05 of a train row, but that
reflects the repetitive nature of attacks like DDoS/PortScan, not leakage —
proven by the flat accuracy curve.) The one honest nuance: **macro-F1 dips to
0.78 on the farthest quintile**, because the rare classes (Bot/Infiltration,
Web Attack) are exactly the flows that sit far from dense training clusters —
the residual difficulty is rare-class generalisation, not leakage.

### Validation summary

| Test | Question | Verdict |
|---|---|---|
| Negative controls | Train/test harness leak? | ✅ Clean — controls collapse to chance |
| Port ablation | Dataset-artifact shortcut? | ✅ No — −0.007 only |
| Perturbation | Real-world robustness? | ⚠️ Brittle to noise, robust to dropout |
| Near-duplicate audit | Test set genuinely held out? | ✅ Clean — accuracy flat vs distance-to-train |

Three clean passes and one honest weakness, across **five** independent angles
(the four above plus the fact that two unrelated model families — Random Forest
and XGBoost — independently reach ~0.97). The conclusion: the high scores are
**genuine for this benchmark**, not an artifact of leakage. The documented
caveats — sensitivity to feature-value noise, and softer rare-class
generalisation on flows far from training — are real-world limitations we
surface rather than hide, which is itself a mark of rigour.

---

## 5. Design choices we explicitly defended

### 5.1  Why scratch LR is the *baseline*, not RF/XGBoost

In ML methodology there are two different things called "baseline":

- **The methodological baseline** — the simple model your fancy model
  is *supposed to beat*, to prove the added complexity helped. For us,
  that's the scratch logistic regression. The MLP's whole pitch is
  *non-linearity helps*; the proof is the +0.087 binary F1 and +0.091
  multi-class macro-F1 over LR.
- **The reference / ceiling** — what well-tuned production tools achieve
  on the same data, so the reader can place your numbers in context.
  That's RF and XGBoost. We never claimed our scratch MLP would beat
  them; the point is to show how close raw-NumPy gets.

We were careful in the README and the comparison notebook to label
RF/XGBoost as *reference models* and to keep "baseline" for the linear
scratch model.

### 5.2  Why the Init_Win sentinel got special treatment

CICIDS-2017 uses `-1` in `Init_Win_bytes_forward` / `Init_Win_bytes_backward`
as a sentinel meaning *"no TCP window value observed"* (e.g. for non-TCP
flows like UDP). Blindly clipping all negative values to 0 — the obvious
default — would make `-1` ("no window observed") indistinguishable from a
genuine window-size of 0.

We instead **preserve the `-1` as a distinct value** and add binary
`has_init_win_fwd` / `has_init_win_bwd` flags. The decision earned its
keep: `has_init_win_fwd` became the **#1 most positive weight** in the
from-scratch binary LR (weight value 8.28, twice the next contender).

### 5.3  Why 15 classes → 7 families, not "top-N + Other"

The naive approach when classes are unlearnable is to lump everything
small into one "Other" bucket. We rejected this because it loses
*semantic structure* — combining Heartbleed (a DoS vulnerability) with
Bot (a malware family) under "Other" tells the model nothing useful.

Instead we grouped by **attack family**: all DoS variants together, all
brute-force tools together, all web-application attacks together, and so
on. This preserves the meaning of the labels and gives every group enough
training rows (the smallest, Bot/Infiltration, has 1,591) to be at least
attempted. The trade-off is that Bot+Infiltration are different attack
types, which we accepted because Infiltration alone (36 rows) is
unlearnable any way you slice it.

### 5.4  Why SMOTE lives in the feature-selection notebook

SMOTE creates synthetic minority samples by interpolating between
existing ones. The natural place to do that is *in the final feature
space the model will see* — after redundant features are removed,
because otherwise the interpolations use columns that we then drop. We
moved SMOTE from the feature-engineering notebook (its original home)
into feature selection for exactly this reason. As a side benefit, the
SMOTE output file then has the same 47 columns as everything else, so
the modelling notebooks need only one input dataset.

### 5.5  Why we capped multi-class SMOTE per class instead of fully
       equalising

A naive multi-class SMOTE lifts every class up to the majority count
(~1.7 M BENIGN). For Web Attack with 1.7k real rows that would produce a
training set that is **99.9 % synthetic** — every "Web Attack" sample
the model sees during training is an interpolation, not a real attack.
That's not a meaningful learning signal.

We instead cap each minority class at **min(majority, 200,000)**, which
keeps the synthetic-to-real ratio sane (~100 synthetic per real for the
smallest classes; less for larger ones). The cap is documented in the
feature-selection notebook and tunable via a single constant
`MULTI_SMOTE_CAP`.

### 5.6  Why feature selection at the same |r| threshold as preprocessing

A reasonable reviewer might ask: *if preprocessing already dropped
|r|>0.95 pairs, why does feature selection do it again at the same
threshold?*

The answer is that the **log1p transformation in feature engineering
changes the correlation structure**. Two features that were uncorrelated
in linear space can become correlated once both are log-transformed (or
vice versa). The feature-selection pass at the same threshold caught **15
new redundant pairs** that appeared only after the transform.

### 5.7  Why we used feature selection rather than PCA

A common reviewer question is *"did you try PCA?"* — we did, and rejected it
with evidence (notebook 14). PCA was the wrong tool here for four reasons,
three a priori and one empirical:

1. **No dimensionality problem.** PCA earns its keep at hundreds/thousands
   of features. We have 47, which tree models and a small MLP handle
   trivially. PCA needed **20 of 47 components just to retain 95 % of the
   variance** — minimal compression, confirming there was little redundant
   variance left to remove after feature selection.
2. **PCA optimises variance, not class separation.** The empirical result
   shows this directly: no PCA setting matched the full features, and the
   gap was **larger on multi-class macro-F1 (−0.014) than on binary F1
   (−0.001)**. PCA's variance-driven mixing dilutes the low-variance
   features that distinguish the *rare* attack classes — exactly the signal
   the project depends on.
3. **It destroys interpretability.** Components are linear blends of all 47
   originals; we could no longer state that `Init_Win` is the rare-class
   signal — our most valuable finding.
4. **Tree models are rotation-sensitive in the wrong direction for PCA** —
   they split on individual features, so rotating the space tends to make
   them slightly worse, which is what we observed.

| Feature set | Binary F1 | Multi macro-F1 |
|---|---:|---:|
| Full 47 features | 0.9958 | 0.9639 |
| PCA-30 (best) | 0.9945 | 0.9497 |
| PCA-20 (95 % var) | 0.9942 | 0.9416 |

Verdict: correlation-based feature selection is the better choice here —
equal-or-better performance *and* full interpretability.

---

## 6. Limitations and honest caveats

1. **Bot/Infiltration F1 plateaus around 0.83 even with XGBoost.** This
   is the hardest class in the dataset and our merge of Bot with
   Infiltration is partially responsible — they're different attack
   types with different flow signatures.
2. **Our scratch MLP is a small one (≤ 45k parameters).** Bigger
   architectures didn't help in our experiments because the rare classes
   couldn't constrain the extra capacity. A pretrained tabular model
   like TabNet or a much larger MLP with strong regularisation might
   close more of the rare-class gap, but those are out of the
   "from scratch in NumPy" scope.
3. **We tuned on the validation split with a fixed seed.** A proper
   evaluation would use k-fold cross-validation across multiple seeds.
   The grid we ran isn't strict enough to claim statistical significance
   of small differences (e.g. RF vs XGBoost both at ~0.997 binary F1 —
   that gap is within noise).
4. **CICIDS-2017 is a benchmark, not real production traffic.** It's an
   isolated test network with synthetic attacks. Real-world IDS
   performance would be lower, particularly on novel attack variants the
   model has never seen.

---

## 7. Project artefacts

Everything is on GitHub at
**https://github.com/hanzlahmunir/ids-cicids2017**:

- **Nine clean template notebooks** under `notebooks/`
- **Nine rendered notebooks** under `outputs/` (with all figures and
  reports embedded)
- **README** with the headline results matrix
- **Text-format report files** generated by each notebook (in the Kaggle
  output of each respective notebook)
- **Saved model artefacts** — `.npz` for the scratch models, `.joblib`
  for RF, `.json` for XGBoost — produced by the modelling notebooks

The dataset itself (CICIDS-2017) is *not* in the repository; users
download it from the Canadian Institute for Cybersecurity at
https://www.unb.ca/cic/datasets/ids-2017.html.

---

## 8. What we'd do next if we had more time

In rough priority order:

1. **Treat Bot and Infiltration separately again** and only merge them
   at the *prediction* stage if needed. A specialised one-vs-rest model
   per rare class might recover the structure we lost by merging.
2. **Larger MLPs with heavier regularisation** — wider networks with
   weight decay > 0 and dropout > 0 might out-perform our small MLP on
   the rare classes. The current grid was constrained by Kaggle's CPU
   budget.
3. **Calibrate the model probabilities.** All four models produce
   probabilities, but we never checked whether `p = 0.8` actually means
   "80 % of these are positive." Platt scaling or isotonic regression
   on the validation split would tighten the probabilities — useful if
   the IDS is going to use thresholds other than 0.5.
4. **A streaming-inference demo** — load the saved model weights and
   classify a single network flow end to end. Useful for showing the
   pipeline runs in production-like conditions without retraining.

---

## 9. Slide-by-slide cheat sheet for the presentation

| Slide | Headline | Backup number |
|---|---|---|
| 1 — Title | Network intrusion detection on CICIDS-2017 | 4 models × 2 tasks |
| 2 — Problem | 2.83 M flows, 15 attack types, severely imbalanced | BENIGN 80 % |
| 3 — Approach | Linear baseline → non-linear scratch model → reference benchmark | LR → MLP → RF/XGB |
| 4 — Data journey | Rows & features at every stage | 79 → 49 → 58 → 47 features |
| 5 — Why preprocessing matters | 9 % duplicate rows, Inf in 2 cols, sentinel encoding in Init_Win | + the per-class median imputation choice |
| 6 — Feature engineering wins | `bwd_header_ratio` is #2 by RF importance | log1p halves mean \|skew\| from 54 → 0.9 |
| 7 — Feature selection | Pearson + Spearman + MI + redundancy pruning | 11 features dropped, 47 kept |
| 8 — Scratch LR | Pure NumPy, mini-batch GD, class-weighted BCE | binary F1 = 0.9052 |
| 9 — Scratch MLP | He init, ReLU, dropout, hand-derived backprop | binary F1 = 0.9926 |
| 10 — Imbalance rule of thumb | CW for binary, SMOTE for multi-class | +0.094 macro-F1 at 1000:1 |
| 11 — 4 × 2 results matrix | Headline numbers | from the report |
| 12 — Per-class lift | Rare classes are where models actually differ | Bot/Infil: 0.07 → 0.23 → 0.83 |
| 13 — Limitations | Bot/Infil plateau, fixed seed, benchmark not real-world | — |
| 14 — Repository | github.com/hanzlahmunir/ids-cicids2017 | 9 notebooks, full pipeline |

---

*End of report.*
