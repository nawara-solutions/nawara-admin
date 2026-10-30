import re,sys,os,glob
root=sys.argv[1]
KEEP=re.compile(r"@(UseGuards|Actors|CallerService|RequireServiceOperation|RequireCapability|RefundOwner|AssistanceUser|VerifiedFeeActor|PlatformOwner|Owner|HumanActor|RefuseServiceCallers|HumanBearer|FeeActorKind|Scope|Public|Roles|StepUp\w*|Require\w*|ApiBearerAuth|ApiHeader)\b(\([^\n]*\))?")
for f in sorted(glob.glob(root+'/apps/*/src/**/*controller.ts',recursive=True)):
    src=open(f).read(); lines=src.split('\n')
    svc=f.split('/apps/')[1].split('/')[0]
    # blocks: find class decorators
    cls=[];prefix=None;i=0
    blockstart=None
    for i,l in enumerate(lines):
        s=l.strip()
        m=re.search(r"@Controller\(\s*(?:'([^']*)')?",l)
        if m:
            prefix=m.group(1) or ''
            # collect class-level decorators: from here to 'export class'
            cls=[]
            for j in range(max(0,i-8),len(lines)):
                if 'export class' in lines[j]: break
                for mm in KEEP.finditer(lines[j]):
                    if 'ApiHeader' in mm.group(0) or 'ApiBearer' in mm.group(0): continue
                    cls.append(mm.group(0).strip()[:90])
            continue
        m=re.search(r"@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?",l)
        if m and prefix is not None:
            p='/'+'/'.join(x for x in [prefix,m.group(2) or ''] if x)
            # method decorators: scan back to previous blank/'}' and forward to method sig
            dec=[]
            j=i-1
            while j>0 and (lines[j].strip().startswith('@') or lines[j].strip().startswith('}),') or lines[j].strip()=='' and False or not lines[j].strip().endswith('}') and not lines[j].strip()==''):
                for mm in KEEP.finditer(lines[j]): dec.append(mm.group(0)[:90])
                j-=1
                if i-j>60: break
            for k in range(i+1,min(i+60,len(lines))):
                if re.match(r"\s*(?:async\s+)?\w+\s*\(",lines[k]) and not lines[k].strip().startswith('@'): 
                    # also scan params for Actors etc
                    for kk in range(k,min(k+8,len(lines))):
                        for mm in KEEP.finditer(lines[kk]): dec.append(mm.group(0)[:90])
                    break
                for mm in KEEP.finditer(lines[k]): dec.append(mm.group(0)[:90])
            dec=[d for d in dec if not d.startswith('@ApiHeader') and not d.startswith('@ApiBearer')]
            print(f"{svc[:4]}\t{m.group(1).upper()}\t{p}\tCLS[{'; '.join(cls)}]\tM[{'; '.join(dict.fromkeys(dec))}]")
