import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt

STRATEGIES = ["polite", "monotone", "caffeinated"]

SLO_TITLES = {
    "polite": "Vljudna",
    "monotone": "Monotona",
    "caffeinated": "Kofeinirana",
}

path = sys.argv[1] if len(sys.argv) > 1 else "final_solutions/times.json"
out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".")
out_dir.mkdir(parents=True, exist_ok=True)

with open(path, encoding="utf-8") as f:
    data = json.load(f)


def plot_strategy(ax, strat):
    """Nariše čase po k za dano strategijo na osi ax; eno krivuljo na n."""
    strat_data = data.get(strat, {})
    # sort n numerically so the legend/colors are in order
    for n in sorted(strat_data, key=int):
        entry = strat_data[n]
        k_times = entry.get("k_times", {})
        if not k_times:
            continue
        ks = sorted(k_times, key=int)
        xs = [int(k) for k in ks]
        ys = [k_times[k] for k in ks]
        best_k = entry.get("best_k")
        label = f"n={n}" + ("" if best_k is not None else " (nerazrešeno)")
        line, = ax.plot(xs, ys, marker="o", label=label)
        # mark the k that turned out to be the answer (best_k) with a star
        if best_k is not None and str(best_k) in k_times:
            ax.plot(best_k, k_times[str(best_k)], marker="*", markersize=15,
                    color=line.get_color(), linestyle="none")

    ax.set_title(SLO_TITLES.get(strat, strat))
    ax.set_xlabel("k (število levov)")
    ax.set_ylabel("čas [s]")
    ax.grid(True, alpha=0.3)
    ax.legend(title="n (velikost grafa)")


saved = []

# --- Združena slika (vse tri strategije v eni vrstici) ---
fig, axes = plt.subplots(1, len(STRATEGIES), figsize=(16, 5))
for ax, strat in zip(axes, STRATEGIES):
    plot_strategy(ax, strat)
fig.suptitle("Čas preverjanja, ali graf lahko očistimo s k levi, po strategijah")
fig.tight_layout()
combined = out_dir / "times_plot.png"
fig.savefig(combined, dpi=150)
saved.append(combined)
plt.close(fig)

# --- Tri ločene slike (kot jih vključuje diploma) ---
for strat in STRATEGIES:
    fig_s, ax_s = plt.subplots(figsize=(6, 4.5))
    plot_strategy(ax_s, strat)
    fig_s.tight_layout()
    out_path = out_dir / f"times_{strat}.png"
    fig_s.savefig(out_path, dpi=150)
    saved.append(out_path)
    plt.close(fig_s)

print("Shranjene slike:")
for p in saved:
    print(f"  {p}")
