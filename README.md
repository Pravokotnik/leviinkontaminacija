# Levi in kontaminacija — simulator

Simulator problema levov in kontaminacije na trikotniških mrežah $P_n$.
Z izčrpnim preiskovanjem poišče najmanjše število levov $k$ za štiri modele
gibanja (pasovni, vljudni, kofeinirani, monotoni) in rezultate prikaže v
interaktivni spletni aplikaciji.

## Struktura

| Pot | Vsebina |
|-----|---------|
| `graph/`, `engine/`, `strategies/` | simulacijsko jedro (graf, korak igre, predvajanje) |
| `solutions_generator/` | štirje načrtovalniki + `search_utils.py` (spodnja meja, simetrije) |
| `main.py` | zažene preiskovanje in shrani rezultate |
| `plot_times.py` | izriše grafe časov iz `times.json` |
| `final_solutions/` | shranjene rešitve in `times.json` |
| `web/` | interaktivna spletna aplikacija |

## Zagon preiskovanja (rezultati)

V `main.py` v bloku `if __name__ == "__main__":` odkomentiraj strategijo in
razpon `n`, ki ju želiš pognati, nato:

```bash
python main.py
```

Rezultati se sproti shranijo v `final_solutions/`:

- **ena JSON datoteka na najdeno rešitev** — `strategy`, `n`, `k`, `steps`,
  `moves`, `search_status`;
- **`times.json`** — za vsak $n$: `best_k`, časi po $k$ (`k_times`) in status
  vsakega $k$ (`k_status`: najden / naravno izčrpano / zadel `MAX_STATES`).

## Spletna aplikacija

Bere rešitve neposredno iz `final_solutions/`, zato strežnik poženi iz mape
`simulator/` (ne iz `web/`):

```bash
python -m http.server 8000
```

Nato odpri <http://localhost:8000/web/>.

## Grafi časov

```bash
python plot_times.py
```

Shrani združeno sliko in tri ločene (`times_polite.png`, `times_monotone.png`,
`times_caffeinated.png`) v podano mapo (privzeto trenutna).
