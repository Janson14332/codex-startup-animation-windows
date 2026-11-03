import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDefaults} from './bootstrap.mjs';
test('首次运行可初始化，重复运行保留自定义素材',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codex-bootstrap-test-'));
  try{
    await cp(fileURLToPath(new URL('../examples',import.meta.url)),join(root,'examples'),{recursive:true});
    assert.equal(await ensureDefaults(root),true);
    assert.equal(JSON.parse(await readFile(join(root,'assets/media-config.json'),'utf8')).type,'image');
    const local=join(root,'assets/artwork.png');await writeFile(local,'personal image sentinel');
    assert.equal(await ensureDefaults(root),false);
    assert.equal(await readFile(local,'utf8'),'personal image sentinel');
  }finally{await rm(root,{recursive:true,force:true});}
});
