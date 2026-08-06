#!/usr/bin/env python3
"""Reject duplicate API routes before `sam deploy` finds them.

SAM rejects the same path+method twice on one API, but only at changeset
creation — after build, upload and a couple of minutes of CI. The error names
the wrong resource too: a stray event appended to AdminMetricsFunction was
reported as `Resource with id [AdminMetricsFunction] is invalid`, which sent
the investigation to a function that had nothing to do with it.

This catches it in a second, locally, and names the right owners.
"""
import collections, sys, yaml

class L(yaml.SafeLoader):
    pass

def _keep(loader, node):
    if isinstance(node, yaml.ScalarNode):   return loader.construct_scalar(node)
    if isinstance(node, yaml.SequenceNode): return loader.construct_sequence(node)
    return loader.construct_mapping(node)

for tag in ['!Ref','!Sub','!GetAtt','!Join','!Select','!Split','!ImportValue',
            '!Equals','!If','!Not','!FindInMap','!Base64','!Condition']:
    L.add_constructor(tag, _keep)

doc = yaml.load(open(sys.argv[1] if len(sys.argv) > 1 else 'template.yaml'), Loader=L)

routes = collections.defaultdict(list)
for name, res in (doc.get('Resources') or {}).items():
    if res.get('Type') != 'AWS::Serverless::Function':
        continue
    for ev_name, ev in (res['Properties'].get('Events') or {}).items():
        if ev.get('Type') not in ('HttpApi', 'Api'):
            continue
        p = ev.get('Properties', {})
        routes[(p.get('Path'), str(p.get('Method', 'ANY')).upper())].append(f"{name}.{ev_name}")

dupes = {k: v for k, v in routes.items() if len(v) > 1}
if dupes:
    print("Duplicate API routes — SAM will reject this template:\n")
    for (path, method), owners in sorted(dupes.items()):
        print(f"  {method} {path}")
        for o in owners:
            print(f"      defined by {o}")
    sys.exit(1)

print(f"Routes OK — {len(routes)} unique path+method combinations.")
