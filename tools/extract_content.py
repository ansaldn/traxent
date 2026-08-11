#!/usr/bin/env python3
"""
VENDORED COPY — canonical source lives at traxentApp/tools/extract_content.py
(iOS repo). This copy exists so the web deploy can regenerate
src/content/modules.json automatically on every push. If the iOS team updates
their extractor, re-vendor it here. Keep the two in sync.

Traxent content extractor (v3) — converts the web repo's hand-authored lesson
HTML into the iOS app's Modules.json + bundled illustration PNGs.

Usage:  python3 extract_content.py <path-to-traxent-web-repo> <path-to-ios-Resources-dir>

Handles three page generations:
  - learn-module-1..6.html  (classic: callouts/.cl, vis-exp, exercises, EX_FB,
    QUESTIONS/QS quizzes, chart-components)
  - learn-101/201/301.html  (starter: <figure> SVG illustrations, side-note,
    bridge, .q quizzes with pick(this,bool))
  - learn-module-7.html     (step-based onboarding page, no quiz)

Requires: beautifulsoup4, json5, cairosvg
"""
import re, json, sys, os
import json5, cairosvg
from bs4 import BeautifulSoup, NavigableString, Tag

SRC = os.path.join(sys.argv[1], 'src')
OUT_DIR = sys.argv[2]
ILLUST_DIR = os.path.join(OUT_DIR, 'Illustrations')
os.makedirs(ILLUST_DIR, exist_ok=True)

CHARTS = {
 'l1-2': [('uptrend','A clean uptrend: higher highs, higher lows.'),
          ('ranging','A ranging market — price oscillating between support and resistance.'),
          ('uptrend','Candlesticks in context: each bar summarises the session battle between buyers and sellers.')],
 'l1-3': [('entryStop','Entry, stop and 2R target on a long setup.')],
 'l2-2': [('bullFlag','Bull flag: sharp pole, orderly pullback, breakout.')],
 'l2-3': [('insideBar','Inside bar: the mother bar defines the range; breakout follows.')],
 'l2-4': [('bos','Bullish break of structure: previous swing high broken with conviction.')],
 'l2-5': [('vwapReclaim','VWAP reclaim: price loses VWAP, reclaims it, and holds above.')],
 'l3-1': [('entryStop','Position sizing starts from the stop distance on the chart.')],
 'l3-2': [('stopPlacement','Stop placed below the swing low that defines the setup.')],
 'l3-3': [('riskReward','1R risk against a 2R target — the maths behind expectancy.')],
 'l4-3': [('downtrend','Plan check: would your setup rules keep you out of this downtrend?')],
}
NAV = re.compile(r'^(Next exercise|Continue reading|Next lesson|Back to top|Show answer|Continue to Lesson \d+|Take the( final)? (quiz|assessment)|Final assessment|Complete module|Back to Learn)\s*→?\s*$', re.I)


def itext(el):
    parts = []
    for c in el.children if isinstance(el, Tag) else []:
        if isinstance(c, NavigableString): parts.append(str(c))
        elif c.name in ('strong', 'b'): parts.append('**' + c.get_text() + '**')
        elif c.name in ('em', 'i'): parts.append('*' + c.get_text() + '*')
        elif c.name == 'br': parts.append('\n')
        else: parts.append(c.get_text(' '))
    return re.sub(r'\s+', ' ', ''.join(parts)).strip()


def cls(el):
    return set(el.get('class') or []) if isinstance(el, Tag) else set()


def grid_items(el):
    items = []
    for vc in el.find_all(class_='vis-cell'):
        g = lambda k: (vc.find(class_=k).get_text(' ', strip=True) if vc.find(class_=k) else '')
        items.append({'label': g('vis-cell-label'), 'value': g('vis-cell-val'), 'sub': g('vis-cell-sub')})
    return items


def parse_exercise(el, ex_fb):
    exid = el.get('id', '')
    hd = el.find(class_='exercise-hd')
    badge = hd.find(class_='ex-badge').get_text(strip=True) if hd and hd.find(class_='ex-badge') else 'Exercise'
    title = hd.find(class_='ex-title').get_text(strip=True) if hd and hd.find(class_='ex-title') else ''
    q = el.find(class_='ex-question')
    options, correct = [], None
    for btn in el.find_all('button', class_='ex-opt'):
        m = re.search(r"checkEx\('([^']*)','([^']*)',this,'([^']*)'\)", btn.get('onclick', ''))
        label = re.sub(r'^[▲▼↔◀▶△▽\s]+', '', btn.get_text(' ', strip=True))
        value = m.group(2) if m else label.lower()
        if m: correct = m.group(3)
        entry = ((ex_fb or {}).get(exid, {}).get(value)
                 or (ex_fb or {}).get(exid, {}).get(correct) or {})
        fb = entry.get('correct', '') if value == correct else entry.get('incorrect', '')
        options.append({'label': label, 'value': value, 'feedback': re.sub(r'^[✓✗]\s*', '', fb)})
    return {'type': 'exercise', 'badge': badge, 'title': title,
            'question': itext(q) if q else '', 'options': options,
            'correct': correct or (options[0]['value'] if options else '')}


FIG_COUNTER = {}

def parse_figure(el, module_id, lesson_key):
    svg = el.find('svg')
    if svg is None: return None
    n = FIG_COUNTER.get(lesson_key, 0) + 1
    FIG_COUNTER[lesson_key] = n
    name = f'fig-{lesson_key}-{n}'
    # BeautifulSoup lowercases attributes → restore viewBox (case-sensitive in
    # SVG) and give cairosvg an explicit pixel size from it.
    raw = str(svg)
    vb = svg.get('viewbox') or svg.get('viewBox') or '0 0 460 150'
    parts = vb.split()
    width, height = float(parts[2]), float(parts[3])
    raw = raw.replace('viewbox=', 'viewBox=', 1)
    raw = raw.replace('<svg ', f'<svg width="{width}" height="{height}" ', 1)
    cairosvg.svg2png(bytestring=raw.encode(), write_to=os.path.join(ILLUST_DIR, name + '.png'),
                     scale=3, background_color='white')
    cap = el.find('figcaption')
    return {'type': 'figure', 'image': name,
            'caption': cap.get_text(' ', strip=True) if cap else '',
            'alt': svg.get('aria-label', cap.get_text(' ', strip=True) if cap else 'Illustration')}


def parse_blocks(container, blocks, ex_fb, module_id, lesson_key):
    for el in container.children:
        if isinstance(el, NavigableString):
            t = str(el).strip()
            if t: blocks.append({'type': 'paragraph', 'text': t})
            continue
        if not isinstance(el, Tag): continue
        cs = cls(el)
        if el.name in ('h2', 'h3', 'h4'):
            t = itext(el)
            if t: blocks.append({'type': 'heading', 'text': t})
        elif el.name == 'p':
            t = itext(el)
            if t: blocks.append({'type': 'paragraph', 'text': t})
        elif el.name == 'figure' or 'figure' in cs:
            fig = parse_figure(el, module_id, lesson_key)
            if fig: blocks.append(fig)
        elif 'side-note' in cs:
            blocks.append({'type': 'callout', 'style': 'info', 'title': None, 'text': itext(el)})
        elif 'bridge' in cs:
            continue  # web-only "Next: ..." teaser; iOS has its own continue flow
        elif 'callout' in cs:
            style = 'key' if 'callout-key' in cs else 'warn' if 'callout-warn' in cs else 'info'
            lead_el = el.find(class_='cl') or el.find(class_='callout-title')
            lead = itext(lead_el) if lead_el else None
            ps = [itext(p) for p in el.find_all('p')]
            ps = [p for p in ps if p]
            if lead and ps: title, text = lead, '\n\n'.join(ps)
            elif lead: title, text = None, lead
            else: title, text = None, ('\n\n'.join(ps) if ps else itext(el))
            blocks.append({'type': 'callout', 'style': style, 'title': title, 'text': text})
        elif 'vis-exp' in cs:
            t = el.find(class_='vis-exp-title')
            if t: blocks.append({'type': 'heading', 'text': t.get_text(strip=True)})
            items = grid_items(el)
            if items: blocks.append({'type': 'grid', 'items': items})
        elif 'exercise' in cs:
            blocks.append(parse_exercise(el, ex_fb))
        elif 'chart-component' in cs or 'chart-embed' in cs or 'tv-wrap' in cs or el.name == 'iframe':
            blocks.append({'type': 'chartNote', 'text': 'Interactive chart — explore this setup in the Traxent web app or your charting platform.'})
        elif 'stat-row' in cs or 'stat-grid' in cs:
            items = []
            for sc in el.find_all(class_='stat-card'):
                v = sc.find(class_='stat-val'); l = sc.find(class_='stat-label')
                items.append({'value': v.get_text(strip=True) if v else '', 'label': l.get_text(strip=True) if l else ''})
            if items: blocks.append({'type': 'stats', 'items': items})
        elif 'rules-grid' in cs:
            items = []
            for rc in el.find_all(class_='rule-card'):
                g = lambda k: rc.find(class_=k)
                items.append({'name': g('rule-card-name').get_text(strip=True) if g('rule-card-name') else '',
                              'value': g('rule-card-val').get_text(strip=True) if g('rule-card-val') else '',
                              'detail': itext(g('rule-detail')) if g('rule-detail') else ''})
            if items: blocks.append({'type': 'ruleCards', 'items': items})
        elif 'vis-row' in cs or 'vis-grid' in cs:
            items = grid_items(el)
            if items: blocks.append({'type': 'grid', 'items': items})
        elif el.name in ('ul', 'ol'):
            items = [itext(li) for li in el.find_all('li', recursive=False)]
            items = [i for i in items if i]
            if items: blocks.append({'type': 'list', 'ordered': el.name == 'ol', 'items': items})
        elif el.name == 'table':
            rows = [[c.get_text(strip=True) for c in tr.find_all(['td', 'th'])] for tr in el.find_all('tr')]
            if rows: blocks.append({'type': 'table', 'rows': rows})
        elif el.name in ('div', 'section', 'article'):
            parse_blocks(el, blocks, ex_fb, module_id, lesson_key)
        else:
            t = itext(el)
            if t: blocks.append({'type': 'paragraph', 'text': t})


def parse_classic_quiz(html):
    m = re.search(r'const QUESTIONS\s*=\s*(\[[\s\S]*?\])\s*;', html); fmt = 'long'
    if not m:
        m = re.search(r'const QS\s*=\s*(\[[\s\S]*?\])\s*;', html); fmt = 'short'
    if not m: return []
    out = []
    for q in json5.loads(m.group(1)):
        t, o, c = (q['text'], q['options'], q['correct']) if fmt == 'long' else (q['t'], q['o'], q['c'])
        fb = q.get('fb') or {}
        out.append({'text': t, 'options': o, 'correct': c,
                    'correctFeedback': fb.get('c', ''), 'wrongFeedback': fb.get('w', '')})
    return out


def parse_starter_quiz(div):
    out = []
    for q in div.find_all(class_='q'):
        text = re.sub(r'^\d+\.\s*', '', q.find(class_='q-text').get_text(' ', strip=True))
        options, correct = [], 0
        for i, btn in enumerate(q.find_all('button', class_='opt')):
            if 'true' in btn.get('onclick', ''): correct = i
            options.append(btn.get_text(' ', strip=True))
        exp = q.find(class_='q-exp')
        explanation = exp.get_text(' ', strip=True) if exp else ''
        out.append({'text': text, 'options': options, 'correct': correct,
                    'correctFeedback': explanation, 'wrongFeedback': explanation})
    return out


def extract_page_lessons(path, cat, module_id):
    html = open(path).read()
    soup = BeautifulSoup(html, 'html.parser')
    mfb = re.search(r'const EX_FB\s*=\s*(\{[\s\S]*?\})\s*;', html)
    ex_fb = json5.loads(mfb.group(1)) if mfb else {}
    classic_quiz = parse_classic_quiz(html)
    lessons = []

    # Step-based page (module 7): no lesson divs, steps map to keys in order.
    steps = soup.find_all(class_='step')
    if not soup.find(id='lesson-0') and steps:
        lede = soup.find(class_='lede')
        gate = soup.find(class_='ready-gate')
        for i, lesson in enumerate(cat['lessons']):
            entry = {'key': lesson['key'], 'name': lesson['name'], 'type': 'lesson'}
            if i < len(steps):
                step = steps[i]
                hd = step.find(['h2', 'h3'])
                entry['title'] = hd.get_text(strip=True) if hd else lesson['name']
                entry['eyebrow'] = f"Step {i + 1} of {len(steps)}"
                if i == 0 and lede: entry['intro'] = itext(lede)
                blocks = []
                if i == 0 and gate:
                    blocks.append({'type': 'callout', 'style': 'warn', 'title': 'Before you start',
                                   'text': itext(gate)})
                body = [c for c in step.children if isinstance(c, Tag)
                        and not ({'step-num'} & cls(c)) and c.name not in ('h2', 'h3')]
                for el in body:
                    parse_blocks(el, blocks, ex_fb, module_id, lesson['key']) if el.name in ('div','section') \
                        else parse_blocks_wrap(el, blocks, ex_fb, module_id, lesson['key'])
                entry['blocks'] = blocks
            lessons.append(entry)
        return lessons

    for li, lesson in enumerate(cat['lessons']):
        div = soup.find(id=f'lesson-{li}')
        entry = {'key': lesson['key'], 'name': lesson['name'], 'type': lesson['type'].lower()}
        if lesson['type'] == 'Quiz':
            entry['questions'] = classic_quiz or (parse_starter_quiz(div) if div else [])
            qh = div.find(class_='quiz-sub') if div else None
            entry['intro'] = qh.get_text(strip=True) if qh else 'Answer every question to complete this module.'
        elif div:
            hd = div.find(class_='lesson-hd')
            if hd:
                g = lambda k: hd.find(class_=k)
                entry['eyebrow'] = g('lesson-eyebrow').get_text(strip=True) if g('lesson-eyebrow') else None
                entry['title'] = g('lesson-title').get_text(strip=True) if g('lesson-title') else lesson['name']
                entry['intro'] = itext(g('lesson-intro')) if g('lesson-intro') else None
            blocks = []
            parse_blocks(div.find(class_='lesson-body') or div, blocks, ex_fb, module_id, lesson['key'])
            entry['blocks'] = blocks
        lessons.append(entry)
    return lessons


def parse_blocks_wrap(el, blocks, ex_fb, module_id, key):
    """Route a single top-level element through the block parser."""
    class Holder:  # minimal container with .children
        def __init__(self, el): self.children = [el]
    parse_blocks(Holder(el), blocks, ex_fb, module_id, key)


def postprocess(modules):
    for m in modules:
        for l in m['lessons']:
            blocks = l.get('blocks')
            if not blocks: continue
            kinds = list(CHARTS.get(l['key'], []))
            out = []
            title = (l.get('title') or '').strip().lower()
            for b in blocks:
                t = (b.get('text') or '').strip()
                if b['type'] in ('paragraph', 'heading') and NAV.match(t): continue
                # short web-only CTA links ("Open best-match →")
                if b['type'] == 'paragraph' and t.endswith('→') and len(t) <= 40: continue
                # heading that just repeats the lesson title (step pages)
                if b['type'] == 'heading' and t.lower() == title: continue
                if b['type'] == 'paragraph' and re.search(r'(Use the instrument buttons|live market chart below|Below is a live market chart)', t, re.I):
                    continue
                if b['type'] == 'chartNote' and kinds:
                    kind, caption = kinds.pop(0)
                    out.append({'type': 'chart', 'kind': kind, 'caption': caption}); continue
                if 'text' in b:
                    t2 = re.sub(r'(Chart exercise \d?):?\s*([A-Z])',
                                lambda mm: mm.group(1).rstrip(':') + ': ' + mm.group(2), b['text'])
                    t2 = t2.replace('click each one', 'tap each one')
                    if t2 != b['text']: b = {**b, 'text': t2}
                out.append(b)
            dedup = []
            for b in out:
                if dedup and b['type'] == 'chartNote' and dedup[-1]['type'] == 'chartNote': continue
                dedup.append(b)
            l['blocks'] = dedup


def main():
    learn = open(os.path.join(SRC, 'learn.html')).read()
    catalog = json5.loads(re.search(r'const MODULES\s*=\s*(\[[\s\S]*?\]);\s*\n', learn).group(1))
    modules = []
    for idx, cat in enumerate(catalog, start=1):
        page = os.path.join(SRC, cat['link'].strip('/') + '.html')
        lessons = extract_page_lessons(page, cat, cat['id'])
        modules.append({'id': cat['id'], 'number': idx, 'numLabel': cat['num'], 'title': cat['title'],
                        'desc': cat['desc'], 'minPlan': cat['minPlan'], 'duration': cat['duration'],
                        'lessons': lessons})
    postprocess(modules)
    out_path = os.path.join(OUT_DIR, 'Modules.json')
    json.dump({'schemaVersion': 2, 'modules': modules}, open(out_path, 'w'), indent=1, ensure_ascii=False)

    for m in modules:
        bl = sum(len(l.get('blocks', [])) for l in m['lessons'])
        qs = sum(len(l.get('questions', [])) for l in m['lessons'])
        figs = sum(1 for l in m['lessons'] for b in l.get('blocks', []) if b['type'] == 'figure')
        print(f"{m['id']:12} {m['minPlan']:11} lessons={len(m['lessons'])} blocks={bl} quiz={qs} figs={figs}")
    print('figures written:', sum(FIG_COUNTER.values()), '→', ILLUST_DIR)


if __name__ == '__main__':
    main()
