"""Step 1: extracts the protected French monuments (Mérimée identifier) from Wikidata.

Usage: python scripts/fetch_wikidata.py data/raw [query ...]
Each SPARQL query is saved to its own data/raw/wd_<query>.json file.
"""
import json
import sys
import time
from pathlib import Path

import wikimedia

ENDPOINT = "https://query.wikidata.org/sparql"

# Protected monuments: classé, inscrit, World Heritage, part of a World Heritage site
BASE = """
  ?item wdt:P380 ?merimee ; wdt:P1435 ?prot .
  VALUES ?prot { wd:Q10387684 wd:Q10387575 wd:Q9259 wd:Q43113623 }
"""

QUERIES = {
    # Label, French article, photo, number of wikis
    "core": f"""
SELECT DISTINCT ?item ?label ?article ?image ?sitelinks WHERE {{
  {BASE}
  OPTIONAL {{ ?item rdfs:label ?label FILTER(lang(?label) = "fr") }}
  OPTIONAL {{ ?article schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> . }}
  OPTIONAL {{ ?item wdt:P18 ?image }}
  ?item wikibase:sitelinks ?sitelinks .
}}""",
    "designations": f"""
SELECT DISTINCT ?item ?d WHERE {{
  {BASE}
  ?item wdt:P1435 ?d .
}}""",
    "types": f"""
SELECT DISTINCT ?item ?t WHERE {{
  {BASE}
  ?item wdt:P31 ?t .
}}""",
    "loc": f"""
SELECT DISTINCT ?item ?loc WHERE {{
  {BASE}
  ?item wdt:P131 ?loc .
}}""",
    # Every entity with an INSEE commune code
    "communes": """
SELECT ?c ?insee WHERE { ?c wdt:P374 ?insee . }""",
    "dates": f"""
SELECT DISTINCT ?item ?inception ?architect ?archDeath WHERE {{
  {BASE}
  OPTIONAL {{ ?item wdt:P571 ?inception }}
  OPTIONAL {{ ?item wdt:P84 ?architect . OPTIONAL {{ ?architect wdt:P570 ?archDeath }} }}
}}""",
    "partof": f"""
SELECT DISTINCT ?item ?parent WHERE {{
  {BASE}
  {{ ?item wdt:P361 ?parent }} UNION {{ ?parent wdt:P527 ?item }}
  ?parent wdt:P757 ?whsid .
}}""",
    # World Heritage sites in France
    "unesco": """
SELECT DISTINCT ?whs ?label ?whsid ?article WHERE {
  ?whs wdt:P757 ?whsid ; wdt:P17 wd:Q142 .
  OPTIONAL { ?whs rdfs:label ?label FILTER(lang(?label) = "fr") }
  OPTIONAL { ?article schema:about ?whs ; schema:isPartOf <https://fr.wikipedia.org/> . }
}""",
    # Departments (INSEE code) and their region
    "departements": """
SELECT DISTINCT ?dept ?code ?label ?regLabel WHERE {
  ?dept wdt:P2586 ?code .
  FILTER NOT EXISTS { ?dept wdt:P576 ?end }
  OPTIONAL { ?dept rdfs:label ?label FILTER(lang(?label) = "fr") }
  OPTIONAL { ?dept wdt:P131 ?reg . ?reg wdt:P2585 ?rcode . ?reg rdfs:label ?regLabel FILTER(lang(?regLabel) = "fr") }
}""",
}


def sparql(s, query):
    for attempt in range(4):
        r = wikimedia.request(s, "POST", ENDPOINT, timeout=300, data={"query": query})
        try:
            return r.json()["results"]["bindings"]
        except ValueError:
            # The endpoint cuts the answer short when the query times out
            print("truncated answer (query timeout?), retrying", flush=True)
            time.sleep(10 * (attempt + 1))
    raise SystemExit("the query keeps timing out")


def fetch_loc_parents(s, out_dir):
    """Places without an INSEE code (Paris, Lyon and Marseille districts…): their parent's code."""
    def q(b):
        return b["value"].rsplit("/", 1)[-1]
    loc = json.loads((out_dir / "wd_loc.json").read_text(encoding="utf-8"))
    with_code = {q(r["c"]) for r in json.loads((out_dir / "wd_communes.json").read_text(encoding="utf-8"))}
    missing = sorted({q(r["loc"]) for r in loc} - with_code)
    rows = []
    for i in range(0, len(missing), 300):
        values = " ".join("wd:" + x for x in missing[i:i + 300])
        rows += sparql(s, f"SELECT ?loc ?insee WHERE {{ VALUES ?loc {{ {values} }} ?loc wdt:P131 ?p . ?p wdt:P374 ?insee . }}")
        time.sleep(wikimedia.PAUSE)
    (out_dir / "wd_locparent.json").write_text(json.dumps(rows), encoding="utf-8")
    print(f"locparent: {len(rows)} rows")


def main(out, names):
    out.mkdir(parents=True, exist_ok=True)
    s = wikimedia.session(Accept="application/sparql-results+json")
    for name in names or list(QUERIES) + ["locparent"]:
        if name == "locparent":
            fetch_loc_parents(s, out)
            continue
        rows = sparql(s, QUERIES[name])
        (out / f"wd_{name}.json").write_text(json.dumps(rows), encoding="utf-8")
        print(f"{name}: {len(rows)} rows", flush=True)
        time.sleep(wikimedia.PAUSE)


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2:])
