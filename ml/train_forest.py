"""Train the route-choice random forest and export it for the Node judge.

    python ml/train_forest.py [--data ml/data/route_decisions.csv] [--out server/src/quest/model/route-forest.json]

Teams are split into train / test groups so the score reflects unseen teams, not memorised ones.
The exported JSON holds every tree as flat arrays; server/src/quest/forest.js evaluates it, and
the export includes check vectors so a test can prove Node and scikit-learn agree.
"""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit

ap = argparse.ArgumentParser()
ap.add_argument("--data", default="ml/data/route_decisions.csv")
ap.add_argument("--out", default="server/src/quest/model/route-forest.json")
ap.add_argument("--trees", type=int, default=120)
ap.add_argument("--depth", type=int, default=12)
args = ap.parse_args()

with open(args.data, newline="") as f:
    rows = list(csv.DictReader(f))
header = list(rows[0].keys())
features = header[header.index("category") + 1 : header.index("win_prob")]

X = np.array([[float(r[c]) for c in features] for r in rows])
y = np.array([int(r["good"]) for r in rows])
groups = np.array([int(r["team"]) for r in rows])
tiers = np.array([r["tier"] for r in rows])
cats = np.array([r["category"] for r in rows])

train_idx, test_idx = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=7).split(X, y, groups))
model = RandomForestClassifier(
    n_estimators=args.trees,
    max_depth=args.depth,
    min_samples_leaf=4,
    class_weight="balanced",
    random_state=7,
    n_jobs=-1,
)
model.fit(X[train_idx], y[train_idx])

proba = model.predict_proba(X[test_idx])[:, 1]
pred = (proba >= 0.5).astype(int)
acc = accuracy_score(y[test_idx], pred)
auc = roc_auc_score(y[test_idx], proba)
base = max(np.mean(y[test_idx]), 1 - np.mean(y[test_idx]))
print(f"rows {len(rows)} · train {len(train_idx)} · test {len(test_idx)} (unseen teams)")
print(f"accuracy {acc:.3f} (majority baseline {base:.3f}) · ROC AUC {auc:.3f}")
print("confusion [[TN FP] [FN TP]]:", confusion_matrix(y[test_idx], pred).tolist())
for tier in ("weak", "average", "strong"):
    m = tiers[test_idx] == tier
    if m.any():
        print(f"  {tier:8s} accuracy {accuracy_score(y[test_idx][m], pred[m]):.3f}  n={m.sum()}")
by_cat = {}
for c in sorted(set(cats[test_idx])):
    m = cats[test_idx] == c
    by_cat[c] = round(float(accuracy_score(y[test_idx][m], pred[m])), 3)
print("accuracy by choice:", by_cat)
importances = sorted(zip(features, model.feature_importances_), key=lambda t: -t[1])
print("top features:", ", ".join(f"{n} {v:.3f}" for n, v in importances[:8]))

# Refit on everything for the shipped model.
model.fit(X, y)


def export_tree(est):
    t = est.tree_
    values = t.value[:, 0, :]
    totals = values.sum(axis=1)
    prob1 = np.where(totals > 0, values[:, 1] / np.maximum(totals, 1e-12), 0.0)
    return {
        "left": t.children_left.tolist(),
        "right": t.children_right.tolist(),
        "feature": t.feature.tolist(),
        "threshold": [float(v) for v in t.threshold],  # full precision: scikit-learn splits on float32 features
        "p": [round(float(v), 6) for v in prob1],
    }


rng = np.random.default_rng(1)
check_idx = rng.choice(len(X), size=min(50, len(X)), replace=False)
out = {
    "kind": "random_forest_classifier",
    "target": "route choice is within 10 points of the best option's win chance",
    "features": features,
    "trees": [export_tree(e) for e in model.estimators_],
    "metrics": {
        "rows": len(rows),
        "test_accuracy": round(float(acc), 4),
        "test_auc": round(float(auc), 4),
        "majority_baseline": round(float(base), 4),
        "accuracy_by_choice": by_cat,
        "label_balance": dict(Counter(int(v) for v in y)),
    },
    "importances": {n: round(float(v), 4) for n, v in importances},
    "checks": [{"x": X[i].tolist(), "p": round(float(model.predict_proba(X[i : i + 1])[0, 1]), 6)} for i in check_idx],
}
Path(args.out).parent.mkdir(parents=True, exist_ok=True)
Path(args.out).write_text(json.dumps(out, separators=(",", ":")))
print(f"exported {len(out['trees'])} trees to {args.out} ({Path(args.out).stat().st_size // 1024} KB)")
