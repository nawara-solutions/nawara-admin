import re,sys,os,glob
root=sys.argv[1]
out=[]
for f in sorted(glob.glob(root+'/apps/*/src/**/*.ts',recursive=True)):
    if f.endswith('.spec.ts'): continue
    src=open(f).read()
    if '@Controller' not in src: continue
    lines=src.split('\n')
    prefix=None
    for i,l in enumerate(lines):
        m=re.search(r"@Controller\(\s*(?:'([^']*)'|\{[^}]*path:\s*'([^']*)')?",l)
        if m:
            prefix=(m.group(1) or m.group(2) or '')
            continue
        m=re.search(r"@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?",l)
        if m and prefix is not None:
            p='/'+'/'.join(x for x in [prefix,m.group(2) or ''] if x)
            # find handler name
            h=''
            for j in range(i+1,min(i+25,len(lines))):
                mm=re.match(r"\s*(?:async\s+)?(\w+)\s*\(",lines[j])
                if mm and not lines[j].strip().startswith('@'):
                    h=mm.group(1);break
            svc=f.split('/apps/')[1].split('/')[0]
            out.append((svc,m.group(1).upper(),p,os.path.relpath(f,root),i+1,h))
for o in out: print('\t'.join(map(str,o)))
