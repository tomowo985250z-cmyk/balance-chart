(async()=>{
  const output=document.getElementById('results');let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try{
    if(new URLSearchParams(location.search).get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');const loaded=new Promise(resolve=>frame.onload=resolve);
    frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const type=(id,value,inputType='insertText')=>run(`(()=>{const input=document.getElementById('${id}');input.focus();input.value='${value}';
      input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'${inputType}'}));return document.activeElement.id;})()`);
    for(let minute=0;minute<60;minute++)assert(type('redMinuteInput',String(minute).padStart(2,'0'))==='blueValueInput','two-digit minute '+minute);
    for(let digit=0;digit<10;digit++)assert(type('redMinuteInput',String(digit))===(digit>=6?'blueValueInput':'redMinuteInput'),'single digit '+digit);
    for(const value of ['','0','5','6','9','00','09','59'])for(const inputType of ['deleteContentBackward','deleteContentForward','deleteByCut']){
      assert(type('redMinuteInput',value,inputType)==='redMinuteInput','deletion stays '+value+'/'+inputType);
    }
    for(const value of ['60','69','99'])assert(type('redMinuteInput',value)==='redMinuteInput','invalid minute stays '+value);
    assert(type('redMinuteInput','05','insertFromPaste')==='blueValueInput','valid pasted minute advances');
    for(const value of ['6','09','59'])assert(type('blueMinuteInput',value)==='blueMinuteInput','Cruise minute unchanged '+value);
    for(const value of ['2','9','10','12'])assert(type('redHourInput',value)==='redMinuteInput','HOV hour unchanged '+value);
    assert(type('redHourInput','1')==='redHourInput','HOV hour 1 waits');
    output.textContent=`PASS: ${checks} checks`;document.title='PASS';
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
