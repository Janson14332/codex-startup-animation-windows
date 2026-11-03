import {updateMedia} from './media-builder.mjs';
updateMedia({input:process.argv[2]}).catch(error=>{
  console.error(`更新失败：${error.message}`);
  process.exitCode=1;
});
