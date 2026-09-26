(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WalletLens=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const COHORTS=[
    ['smart_trader','Smart Trader','Addresses labelled Smart Trader by Nansen.'],
    ['top_pnl','Top PnL','Addresses labelled Top PnL by Nansen.'],
    ['whale','Whale','Large-holder cohort; size does not establish trading skill.'],
    ['public_figure','Public Figure','Addresses labelled Public Figure by Nansen.'],
    ['exchange','Exchange','Exchange-labelled addresses; a flow is not proof of a sale.']
  ];
  const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
  function analyze({market={},flow,marketAt,now=Date.now(),marketTimeframe='1h',flowTimeframe='1h'}={}){
    const normalize=tf=>tf==='24h'?'1d':tf, windowLabel=normalize(flowTimeframe).toUpperCase(), matching=['1h','6h','1d','7d'].includes(normalize(flowTimeframe))&&normalize(marketTimeframe)===normalize(flowTimeframe)&&(!flow?.timeframe||normalize(flow.timeframe)===normalize(flowTimeframe));
    const price=number(market.price_change),volume=number(market.volume);
    const threshold=Math.max(1000,volume!==null&&volume>0?volume*.001:0);
    const result={kind:'unavailable',headline:'Wallet context unavailable',summary:'No usable Nansen cohort flows are available for this token yet.',evidence:[],cautions:[],coverage:0,threshold,price,comparison:false,marketAt:marketAt||null,flowAt:flow?.fetched_at||null};
    if(!flow){result.kind='loading';result.headline='Reading wallet activity';result.summary='Checking Nansen-labelled groups behind this token.';return result}
    if(!flow.ok||!flow.data){result.cautions.push(flow.error||'Missing cohort data is not evidence of no activity.');return result}
    result.evidence=COHORTS.map(([key,label,description])=>{const net=number(flow.data[key+'_net_flow_usd']),count=number(flow.data[key+'_wallet_count']);return {key,label,description,net,wallets:key==='exchange'||count===null||count<0?null:count,meaningful:net!==null&&Math.abs(net)>=threshold}});
    result.coverage=result.evidence.filter(x=>x.net!==null).length;
    if(!result.coverage)return result;
    const marketTime=Date.parse(marketAt),flowTime=Date.parse(flow.fetched_at);
    const flowFresh=Number.isFinite(flowTime)&&now-flowTime>=-60000&&now-flowTime<=20*60000;
    result.comparison=flowFresh&&Number.isFinite(marketTime)&&now-marketTime>=-60000&&now-marketTime<=20*60000&&Math.abs(marketTime-flowTime)<=10*60000&&matching&&price!==null;
    if(volume===null){result.kind='loading';result.headline='Waiting for market context';result.summary='Wallet flows are available. Interpretation waits for the matching market volume.';return result}
    const smart=result.evidence[0],pnl=result.evidence[1];
    const focus=smart.meaningful?smart:pnl.meaningful?pnl:result.evidence.slice(0,4).filter(x=>x.meaningful).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net))[0];
    if(!flowFresh||!matching){
      result.kind='stale';result.headline='Refresh wallet context';result.summary='Cohort observations are old or do not match this '+windowLabel+' view. No current interpretation is shown.';
    }else if(smart.meaningful&&pnl.meaningful&&Math.sign(smart.net)!==Math.sign(pnl.net)){
      result.kind='split';result.headline='Labelled groups disagree';result.summary='Smart Trader and Top PnL have opposite net-flow directions in the '+windowLabel+' view. There is no shared direction across these two cohorts.';
    }else if(focus&&result.comparison&&price>=.01&&focus.net<0){
      result.kind='divergence';result.headline='Price up, '+focus.label+' flows out';result.summary='The '+windowLabel+' price gain sits alongside net outflows from the '+focus.label+' cohort. Price strength is not matched by this group’s net-flow direction.';
    }else if(focus&&result.comparison&&price<=-.01&&focus.net>0){
      result.kind='divergence';result.headline='Price down, '+focus.label+' flows in';result.summary='The '+windowLabel+' price decline sits alongside net inflows to the '+focus.label+' cohort. This is a difference in observations, not evidence of a coming rebound.';
    }else if(focus){
      result.kind=focus.net>0?'inflow':'outflow';result.headline=focus.label+(focus.net>0?' net inflows':' net outflows');result.summary='The '+focus.label+' cohort has a net '+(focus.net>0?'inflow':'outflow')+' in the recent '+windowLabel+' observations. Inspect the other groups before treating this as broad participation.';
    }else{
      result.kind='quiet';result.headline='No prominent labelled flow';result.summary='Available non-exchange cohort flows are below Pulse’s display threshold. This does not mean the token has no trading activity.';
    }
    if(!result.comparison)result.cautions.push('Price-versus-flow comparison withheld: missing price, mismatched window, or observations too far apart.');
    for(const cohort of result.evidence.slice(0,4)){
      if(cohort.meaningful&&cohort.wallets!==null&&cohort.wallets>0&&cohort.wallets<3)result.cautions.push(cohort.label+' flow involves only '+cohort.wallets+' reported wallet'+(cohort.wallets===1?'':'s')+'. This is narrow participation, not proof of broad agreement.');
      if(cohort.net!==null&&cohort.net!==0&&cohort.wallets===0)result.cautions.push(cohort.label+' has non-zero flow but a reported wallet count of zero. Do not infer participation breadth from that count.');
    }
    if(result.coverage<5)result.cautions.push('Some cohort flows are missing; the view is incomplete.');
    if(Array.isArray(flow.warnings)){
      for(const warning of flow.warnings.filter(x=>typeof x==='string')){
        if(/fresh_wallets/.test(warning))continue; // This view does not use that unsupported 1H cohort.
        const note=/exchange_wallet_count/.test(warning)?'Exchange wallet counts are unavailable. A dash does not mean zero exchange activity.':'Nansen returned a data-coverage warning; some observations may be incomplete.';
        if(!result.cautions.includes(note))result.cautions.push(note);
      }
    }
    result.cautions.push('Cohorts can overlap. Their wallet counts and flows must not be added as independent participants.');
    result.cautions.push('Net flows do not by themselves identify buys, sells, or a wallet’s current position.');
    return result;
  }
  return {analyze};
});
