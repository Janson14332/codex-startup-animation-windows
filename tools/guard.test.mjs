import test from 'node:test';
import assert from 'node:assert/strict';
import {decide,describe,guard} from '../extension/guard.mjs';

const base={page:'/index.html',ready:'complete',body:true,visible:'visible',focus:true,modal:false,popover:false,attached:true};

test('判断页面状态：重新加载后注入、叠加层脱离后重置、完成后结束',()=>{
  assert.equal(decide({...base,status:null}),'inject');
  assert.equal(decide({...base,attached:false,status:{phase:'playing',overlay:true,completed:false}}),'reset');
  assert.equal(decide({...base,status:{phase:'complete',overlay:false,completed:true}}),'done');
  assert.equal(decide({...base,status:{phase:'playing',overlay:true,completed:false}}),'wait');
  assert.equal(decide({...base,ready:'loading',status:null}),'wait');
  assert.match(describe({...base,modal:true,status:null}),/无动画.*有模态框/);
});

test('页面重新加载后重新注入一次，播放完成后退出',async()=>{
  let clock=0;const logs=[],calls=[];
  const states=[{...base,status:null},{...base,status:{phase:'playing',overlay:true,completed:false}},{...base,status:{phase:'complete',overlay:false,completed:true}}];
  let probe=0;
  const target={id:'abcdef123',type:'page',url:'app://-/index.html',webSocketDebuggerUrl:'ws://127.0.0.1:9000/devtools/page/abcdef123'};
  await guard({port:9000,source:'INJECT',durationMs:5000,log:line=>logs.push(line),
    fetchImpl:async()=>({json:async()=>[target]}),
    connectImpl:async()=>({call:async(method,params)=>{calls.push(params?.expression||method);
      if(params?.expression?.includes('__aemeathExtension?.status'))return {result:{value:states[Math.min(probe++,2)]}};
      return {result:{value:{installed:true}}};},close(){}}),
    now:()=>clock,pause:async ms=>{clock+=ms;}});
  assert.equal(calls.filter(c=>c==='INJECT').length,1);
  assert.ok(logs.some(l=>l.includes('重新注入')));
  assert.ok(logs.at(-1).includes('播放完成'));
});
