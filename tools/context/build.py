"""Local Graphify build: native code AST + explicit documentation structure.

No semantic API, cloud service or inferred business relationships. The graph is
navigation aid; source documents and executable checks remain authoritative.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone
from urllib.parse import unquote

import yaml
from graphify.detect import detect
from graphify.extract import collect_files, extract
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json, to_html
from graphify.validate import validate_extraction

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'graphify-out'


def node_id(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', value.lower()).strip('_')


def build(force: bool = False) -> None:
    OUT.mkdir(exist_ok=True)
    # An exclusive build lock protects two coordinators or accidental rebuilds.
    lock = OUT / '.build.lock'
    try:
        lock.mkdir()
    except FileExistsError:
        raise SystemExit('Otro rebuild está activo. Si terminó con fallo, comprobar proceso antes de retirar .build.lock.')
    try:
        detection = detect(ROOT)
        code_paths: set[Path] = set()
        for item in detection.get('files', {}).get('code', []):
            target = Path(item)
            code_paths.update(collect_files(target, root=ROOT) if target.is_dir() else [target])
        ast = extract(sorted(code_paths), root=ROOT, cache_root=ROOT, max_workers=2) if code_paths else {'nodes': [], 'edges': []}
        docs: set[Path] = set()
        for kind in ('document', 'code'):
            for item in detection.get('files', {}).get(kind, []):
                target = Path(item)
                if target.suffix.lower() in {'.md', '.yaml', '.yml', '.json'}:
                    docs.add(target)
        # Include textual contracts even if upstream detect assigns a different category.
        docs.update(ROOT.glob('docs/**/*.yaml'))
        docs.update(ROOT.glob('docs/contracts/*.json'))
        nodes: dict[str, dict] = {}
        edges: list[dict] = []
        fingerprints: dict[str, str] = {}
        file_ids: dict[Path, str] = {}

        def add_node(identifier: str, label: str, file: Path, line: int, **attrs) -> None:
            nodes[identifier] = {'id': identifier, 'label': label, 'file_type': 'document',
                                 'source_file': str(file.relative_to(ROOT)), 'source_location': f'L{line}', **attrs}

        def edge(source: str, target: str, relation: str, file: Path, line: int) -> None:
            if source != target:
                edges.append({'source': source, 'target': target, 'relation': relation,
                              'confidence': 'EXTRACTED', 'confidence_score': 1.0, 'weight': 1.0,
                              'source_file': str(file.relative_to(ROOT)), 'source_location': f'L{line}'})

        for file in sorted(docs):
            relative = str(file.relative_to(ROOT))
            identifier = 'document_' + node_id(relative)
            file_ids[file.resolve()] = identifier
            content = file.read_text(encoding='utf-8')
            fingerprints[relative] = hashlib.sha256(content.encode()).hexdigest()
            add_node(identifier, relative, file, 1)
            parent_stack: list[tuple[int, str]] = [(0, identifier)]
            if file.suffix == '.md':
                fenced = False
                for lineno, line in enumerate(content.splitlines(), 1):
                    if line.lstrip().startswith('```'):
                        fenced = not fenced
                    match = re.match(r'^(#{1,6})\s+(.+)', line) if not fenced else None
                    if match:
                        depth, title = len(match[1]), match[2]
                        section_id = identifier + '_' + node_id(title)
                        if section_id in nodes:
                            section_id += '_' + str(lineno)
                        while parent_stack[-1][0] >= depth:
                            parent_stack.pop()
                        add_node(section_id, title, file, lineno)
                        edge(parent_stack[-1][1], section_id, 'contains', file, lineno)
                        parent_stack.append((depth, section_id))
            elif file.suffix in {'.yaml', '.yml'}:
                payload = yaml.safe_load(content)
                if isinstance(payload, dict) and 'openapi' in payload:
                    for path, methods in payload.get('paths', {}).items():
                        for method, operation in methods.items():
                            if method not in {'get', 'post', 'put', 'patch', 'delete', 'head', 'options'}:
                                continue
                            label = f'{method.upper()} {path} — {operation.get("operationId", "")}'
                            op_id = identifier + '_' + node_id(method + '_' + path)
                            needle = 'operationId: ' + operation.get('operationId', '')
                            line = next((i for i, text in enumerate(content.splitlines(), 1) if needle in text), 1)
                            add_node(op_id, label, file, line)
                            edge(identifier, op_id, 'defines', file, line)
        # Only explicit, existing local Markdown links; no guessed relationships.
        for file in sorted(docs):
            if file.suffix != '.md':
                continue
            for lineno, line in enumerate(file.read_text(encoding='utf-8').splitlines(), 1):
                for target in re.findall(r'\]\(([^)]+)\)', line):
                    target = unquote(target.split('#')[0].strip('<>'))
                    if not target or re.match(r'^[a-z]+:', target) or target.startswith('/'):
                        continue
                    destination = (file.parent / target).resolve()
                    if destination in file_ids:
                        edge(file_ids[file.resolve()], file_ids[destination], 'references', file, lineno)
        known_ids = set(nodes) | {node['id'] for node in ast['nodes']}
        resolved_ast_edges = [item for item in ast['edges'] if item['source'] in known_ids and item['target'] in known_ids]
        unresolved_count = len(ast['edges']) - len(resolved_ast_edges)
        if unresolved_count:
            print(f'AST: {unresolved_count} referencias externas/no resueltas omitidas del grafo local.')
        merged = {'nodes': list(nodes.values()) + ast['nodes'], 'edges': edges + resolved_ast_edges,
                  'hyperedges': [], 'input_tokens': 0, 'output_tokens': 0}
        errors = validate_extraction(merged)
        if errors:
            raise SystemExit('Extracción inválida: ' + '; '.join(errors[:10]))
        graph = build_from_json(merged, root=ROOT, directed=False)
        if not graph.number_of_nodes():
            raise SystemExit('Extracción vacía; no se reemplazó el grafo.')
        communities = cluster(graph)
        cohesion = score_all(graph, communities)
        labels = {cid: f'Community {cid}' for cid in communities}
        questions = suggest_questions(graph, communities, labels)
        if not to_json(graph, communities, str(OUT / 'graph.json'), force=force):
            raise SystemExit('Graphify rechazó reducir el grafo; revisar cambios antes de usar rebuild --force.')
        report = generate(graph, communities, cohesion, labels, god_nodes(graph),
                          surprising_connections(graph, communities), detection,
                          {'input': 0, 'output': 0}, str(ROOT), suggested_questions=questions)
        (OUT / 'GRAPH_REPORT.md').write_text(report, encoding='utf-8')
        to_html(graph, communities, str(OUT / 'graph.html'), community_labels=labels)
        (OUT / '.graphify_root').write_text(str(ROOT), encoding='utf-8')
        import sys
        (OUT / '.graphify_python').write_text(sys.executable, encoding='utf-8')
        revision = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True, capture_output=True, check=True).stdout.strip()
        tracked = subprocess.run(['git', 'status', '--porcelain'], cwd=ROOT, text=True, capture_output=True, check=True).stdout
        (OUT / 'context-manifest.json').write_text(json.dumps({
            'graphify_version': '0.9.62', 'built_at': datetime.now(timezone.utc).isoformat(),
            'head': revision, 'dirty_at_build': bool(tracked), 'document_sha256': fingerprints,
            'code_files': len(code_paths), 'document_files': len(docs),
            'unresolved_ast_edges_omitted': unresolved_count,
            'method': 'Graphify AST + explicit headings, endpoints and Markdown links; no semantic LLM pass',
            'nodes': graph.number_of_nodes(), 'edges': graph.number_of_edges(),
        }, indent=2), encoding='utf-8')
        print(f'Contexto: {graph.number_of_nodes()} nodos, {graph.number_of_edges()} relaciones; {len(code_paths)} archivos de código y {len(docs)} documentos/contratos.')
    finally:
        lock.rmdir()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--force', action='store_true', help='Permitir reducción solo tras comprobar borrados intencionales')
    build(parser.parse_args().force)
