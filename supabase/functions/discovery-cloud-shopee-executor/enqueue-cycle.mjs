import {planFourChannelCycle} from './cycle-plan.mjs';
/** Expected policy rejections do not consume product slots or abort the cycle.
 * Every retry uses the SAME signed source snapshot, with accepted diversity
 * reservations retained. Unknown database errors must still throw.
 * @param {Record<string,any>} input
 * @param {(item:any)=>Promise<any>} enqueue
 */
export async function enqueueAvailableCandidates(input,enqueue){
 const max=Math.min(8,Math.max(0,Number(input.maxUnique)||0));
 const accepted=[],attempted=new Set(),blocked={};let jobs=0,rounds=0;
 while(accepted.length<max&&attempted.size<input.candidates.length){
  const plan=planFourChannelCycle({...input,
   candidates:input.candidates.filter(c=>!attempted.has(String(c.id))),
   maxUnique:max-accepted.length,alreadySelected:accepted});
  if(!plan.ready)throw Error('cycle_plan_not_ready');
  if(!plan.selected.length)break;
  rounds++;
  for(const item of plan.selected){
   attempted.add(String(item.ref));
   const result=await enqueue(item);
   if(result?.accepted===true){
    if(!Number.isSafeInteger(result.jobs_created)||result.jobs_created<1)throw Error('atomic_queue_failed');
    accepted.push(item);jobs+=result.jobs_created;
   }else{
    const reason=String(result?.reason||'policy_rejected');
    blocked[reason]=(blocked[reason]||0)+1;
   }
  }
 }
 return {offers:accepted.length,jobs,attempted:attempted.size,rounds,blocked};
}

