(function (global) {
  'use strict';
  const armor = typeof module !== 'undefined' && module.exports ? require('./armor.js') : global.ARMOR;
  const SLOT_LABELS = {primary:'Primary',sidearm:'Sidearm',...armor.SLOT_NAMES};
  const ALL_SLOTS = ['primary','sidearm',...armor.SLOTS];
  const PRIMARY_ORDER = ['autoRifle','miniGun','sniper','shotgun'];
  const number = value => new Intl.NumberFormat().format(value);

  // One inventory entry represents the actual weapon + finish, or an owned
  // armor roll. Each locked armor entry purchases only that slot's piece.
  function loadoutItems(user, slot, weapons, skins) {
    if (slot === 'primary' || slot === 'sidearm') {
      const keys = slot === 'sidearm' ? ['pistol'] : PRIMARY_ORDER.filter(key => weapons[key]?.selectable !== false);
      return keys.flatMap(weaponKey => (skins[weaponKey] || []).map(skin => ({
        id:skin.key,key:skin.key,kind:'weapon',slot,weaponKey,
        name:skin.name === 'Default' ? weapons[weaponKey].name : skin.name,
        type:weapons[weaponKey].name,description:skin.isDefault ? weapons[weaponKey].description : skin.description,
        owned:!!skin.isDefault || !!user?.skins?.owned?.includes(skin.key),price:skin.price || 0,
      })));
    }
    if (!armor.SLOTS.includes(slot)) return [];
    const items = [{id:`none:${slot}`,key:`none:${slot}`,kind:'none',slot,owned:true,name:'Unequipped',type:SLOT_LABELS[slot],description:'Use your original character appearance in this slot.'}];
    for (const definition of Object.values(armor.CATALOG).filter(item => item.slot === slot)) {
      const owned = (user?.armor?.items || []).filter(item => item.key === definition.key);
      for (const item of owned.length ? owned : [null]) items.push({
        id:item?.id || definition.key,key:definition.key,kind:'armor',slot,
        name:definition.name,type:definition.rarity === 'exotic' ? `Exotic ${SLOT_LABELS[slot].toLowerCase()}` : `${armor.SETS[definition.set].name} · ${armor.SETS[definition.set].role}`,
        description:definition.description,rarity:definition.rarity,owned:!!item,
        stats:item?.stats,ranges:definition.ranges,ability:definition.ability,
        price:definition.price,
      });
    }
    return items;
  }

  function equippedItem(user, slot, primary, weapons, skins) {
    const items = loadoutItems(user,slot,weapons,skins);
    if (armor.SLOTS.includes(slot)) return items.find(item => item.id === user?.armor?.equipped?.[slot]) || items[0];
    const weaponKey = slot === 'sidearm' ? 'pistol' : primary;
    const skinKey = user?.skins?.equippedByWeapon?.[weaponKey] || skins[weaponKey]?.find(item => item.isDefault)?.key;
    return items.find(item => item.key === skinKey && item.weaponKey === weaponKey) || items.find(item => item.weaponKey === weaponKey);
  }

  function createLoadoutUI({root, getUser, getPrimary, weapons, skins, onEquip, onPurchase}) {
    const doc = root.ownerDocument, win = doc.defaultView || global;
    const byId = id => doc.getElementById(id);
    const picker = byId('gear-picker'), grid = byId('gear-grid'), popup = byId('gear-popover');
    const status = byId('loadout-status'), statline = byId('loadout-statline');
    const slotButtons = new Map(), tileButtons = new Map();
    let activeSlot = null, inspected = null, busy = false, closeTimer, previewTimer;
    let keyboard = false, ignoreFocus = false, lastPointerType = 'mouse', generation = 0;
    const el = (tag, className='', text) => {
      const node = doc.createElement(tag); node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    function icon(kind) {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 32 32'); svg.setAttribute('fill','none');
      svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.5');
      svg.setAttribute('stroke-linejoin','round'); svg.setAttribute('stroke-linecap','round'); svg.setAttribute('aria-hidden','true');
      const path = doc.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',{
        helmet:'M7 21V13a9 9 0 0 1 18 0v8l-5 6h-8z M7 14h18l-3 6H10z',
        chest:'M11 5l5 3 5-3 7 7-4 6v10H8V18l-4-6z M12 13h8v10h-8z',
        gauntlets:'M8 5l9-2 5 8-3 5 2 10-9 3-4-10 2-5z M10 16l9-2 M12 22l7-2',
        boots:'M12 4h12l-2 13 5 7v4H6v-7l5-4z M12 10h11 M6 24h21',
        sidearm:'M4 9h23v7H16l-2 11H7l2-11H4z M17 16v5h-3',
        primary:'M3 13h19v-2h5v3h4v3h-9v4h-6l-1 6h-5l1-10H3z M13 9h6v4',
        lock:'M9 14V9a7 7 0 0 1 14 0v5 M6 14h20v16H6z',
      }[kind] || 'M7 7l18 18 M7 25L25 7');
      svg.append(path); return svg;
    }
    function artwork(item) {
      const art = el('span','gear-art'); art.append(icon(item?.slot));
      if (item && item.kind !== 'none') {
        const img = el('img'); img.alt = ''; img.draggable = false;
        img.dataset.gearKind = item.kind; img.dataset.gearKey = item.key;
        if (item.weaponKey) img.dataset.weaponKey = item.weaponKey;
        art.append(img);
      }
      return art;
    }
    function thumbnails(scope) { scope.dispatchEvent(new win.CustomEvent('loadout:thumbnails',{bubbles:true,detail:{root:scope}})); }
    const choices = slot => loadoutItems(getUser(),slot,weapons,skins);
    const equipped = slot => equippedItem(getUser(),slot,getPrimary(),weapons,skins);
    function say(message, error=false) { status.textContent = message; status.classList.toggle('is-error',error); }
    function keepOpen() { win.clearTimeout(closeTimer); }
    function inControls(target) { return root.contains(target) && !!target?.closest?.('.equipment-rail, .gear-picker, .gear-popover'); }
    function scheduleClose() {
      keepOpen(); closeTimer = win.setTimeout(() => {
        if (!(keyboard && inControls(doc.activeElement))) close();
      },80);
    }
    function hideDetails() {
      win.clearTimeout(previewTimer); inspected = null; popup.hidden = true;
      for (const tile of tileButtons.values()) tile.classList.remove('is-previewed');
    }
    function close(restoreFocus=false) {
      keepOpen(); const previous = activeSlot; activeSlot = null;
      picker.hidden = true; picker.classList.remove('is-open'); hideDetails();
      for (const button of slotButtons.values()) button.setAttribute('aria-expanded','false');
      if (restoreFocus && previous) { ignoreFocus = true; slotButtons.get(previous).focus(); ignoreFocus = false; }
    }
    function positionPicker() {
      if (!activeSlot) return;
      const rect = slotButtons.get(activeSlot).getBoundingClientRect(), right = armor.SLOTS.includes(activeSlot);
      const width = picker.offsetWidth, height = picker.offsetHeight;
      const x = right ? rect.left-width-12 : rect.right+12;
      picker.style.left = `${Math.max(12,Math.min(win.innerWidth-width-12,x))}px`;
      picker.style.top = `${Math.max(12,Math.min(win.innerHeight-height-12,rect.top-34))}px`;
      picker.style.setProperty('--roll-from',right?'6px':'-6px');
      picker.style.setProperty('--roll-origin',right?'right center':'left center');
    }
    function positionDetails() {
      if (popup.hidden) return;
      const rect = picker.getBoundingClientRect(), width = popup.offsetWidth, height = popup.offsetHeight;
      const right = armor.SLOTS.includes(activeSlot);
      let x = right ? rect.left-width-12 : rect.right+12;
      if (x < 12 || x+width > win.innerWidth-12) x = right ? rect.right+12 : rect.left-width-12;
      // On small screens details become a tappable card at the bottom. Desktop
      // cards sit beside the inventory and never intercept its item squares.
      const narrow = win.innerWidth < 660 || x < 12 || x+width > win.innerWidth-12;
      popup.style.left = `${narrow ? (win.innerWidth-width)/2 : Math.max(12,Math.min(win.innerWidth-width-12,x))}px`;
      popup.style.top = `${narrow ? Math.max(12,win.innerHeight-height-12) : Math.max(12,Math.min(win.innerHeight-height-12,rect.top))}px`;
    }
    function renderSlots() {
      for (const [slot,button] of slotButtons) {
        const item = equipped(slot);
        button.replaceChildren(artwork(item));
        button.classList.toggle('is-empty',item?.kind==='none');
        button.classList.toggle('is-exotic',item?.rarity==='exotic');
        button.dataset.itemId = item?.id || '';
        button.setAttribute('aria-label',`${SLOT_LABELS[slot]}: ${item?.name || 'Unequipped'}. Choose equipment.`);
      }
      const stats = armor.statsForItems(armor.equippedItems(getUser()?.armor));
      statline.replaceChildren(el('strong','','PvE bonuses'));
      let count=0;
      for (const key of Object.keys(armor.STATS)) if (stats[key]) {
        const entry=el('span'); entry.append(el('b','',`+${armor.formatStat(key,stats[key])}`),el('span','',armor.STATS[key].name));
        statline.append(entry); count++;
      }
      if (stats.airDash) { statline.append(el('span','','Shift · Air dash')); count++; }
      if (stats.grenadeRefill) { statline.append(el('span','',`Grenades refill every ${armor.GRENADE_REFILL_MS/1000}s`)); count++; }
      if (!count) statline.append(el('span','','Equip armor to add bonuses. Appearance carries into PvP.'));
      else statline.append(el('span','','Appearance only in PvP'));
      thumbnails(root);
    }
    function renderGrid() {
      if (!activeSlot) return;
      const focusId = doc.activeElement?.dataset?.itemId;
      grid.replaceChildren(); tileButtons.clear();
      const current = equipped(activeSlot);
      for (const item of choices(activeSlot)) {
        const cell=el('div'); cell.setAttribute('role','listitem');
        const button=el('button','gear-tile'); button.type='button'; button.dataset.itemId=item.id;
        button.classList.toggle('is-locked',!item.owned); button.classList.toggle('is-exotic',item.rarity==='exotic');
        button.setAttribute('aria-label',`${item.name}, ${item.type}${!item.owned?', locked':''}`);
        button.setAttribute('aria-pressed',String(item.id===current?.id));
        button.setAttribute('aria-controls','gear-popover'); button.setAttribute('aria-haspopup','dialog');
        button.append(artwork(item));
        if (!item.owned || item.id===current?.id) {
          const mark=el('span','gear-tile-mark');mark.setAttribute('aria-hidden','true');
          if(item.owned)mark.textContent='✓';else mark.append(icon('lock'));
          button.append(mark);
        }
        button.addEventListener('pointerenter',event=>{
          if(event.pointerType==='touch')return;
          keyboard=false;keepOpen();win.clearTimeout(previewTimer);
          previewTimer=win.setTimeout(()=>showDetails(item),30);
        });
        button.addEventListener('pointerleave',()=>win.clearTimeout(previewTimer));
        button.addEventListener('focus',()=>{if(keyboard&&!ignoreFocus)showDetails(item);});
        button.addEventListener('pointerdown',event=>{lastPointerType=event.pointerType;});
        button.addEventListener('click',()=>{
          keepOpen();
          if(!item.owned || lastPointerType==='touch'){showDetails(item);return;}
          return equip(item);
        });
        button.addEventListener('keydown',event=>{
          const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-4,ArrowDown:4}[event.key];
          if(step){event.preventDefault();keyboard=true;const nodes=[...tileButtons.values()];nodes[Math.max(0,Math.min(nodes.length-1,nodes.indexOf(button)+step))]?.focus();}
          if(event.key==='Enter'||event.key===' '){lastPointerType='keyboard';keyboard=true;}
        });
        tileButtons.set(item.id,button);cell.append(button);grid.append(cell);
      }
      if(focusId && tileButtons.has(focusId))tileButtons.get(focusId).focus();
      thumbnails(grid);
    }
    function open(slot, focusGrid=false) {
      if(!getUser())return;
      keepOpen();
      if(activeSlot!==slot){hideDetails();activeSlot=slot;renderGrid();}
      byId('gear-picker-title').textContent=SLOT_LABELS[slot];
      for(const [key,button] of slotButtons)button.setAttribute('aria-expanded',String(key===slot));
      picker.hidden=false;positionPicker();thumbnails(picker);
      win.requestAnimationFrame(()=>{if(activeSlot)picker.classList.add('is-open');});
      if(focusGrid)[...tileButtons.values()][0]?.focus();
    }
    function showDetails(item) {
      if(!activeSlot || item.slot!==activeSlot)return;
      inspected=item;popup.replaceChildren();popup.hidden=false;
      for(const [id,button] of tileButtons)button.classList.toggle('is-previewed',id===item.id);
      const dismiss=el('button','gear-popover-close','×');dismiss.type='button';dismiss.setAttribute('aria-label','Close item details');
      dismiss.addEventListener('click',()=>{const tile=tileButtons.get(inspected?.id);hideDetails();ignoreFocus=true;tile?.focus();ignoreFocus=false;});
      const preview=el('div','gear-preview-art');preview.append(artwork(item));
      const copy=el('div','gear-popover-copy');
      const title=el('h3','',item.name);title.id='gear-item-name';popup.setAttribute('aria-labelledby',title.id);
      copy.append(title,el('span','gear-item-type',item.type),el('p','gear-description',item.description));
      if(item.kind==='armor') {
        const statRows=el('div','gear-item-stats'), current=equipped(activeSlot)?.stats||{};
        const values=item.stats || item.ranges;
        for(const key of Object.keys(armor.STATS)) {
          if(!values?.[key] && !current[key])continue;
          const row=el('div','gear-item-stat');
          const range=item.ranges?.[key];
          const value=item.stats ? armor.formatStat(key,item.stats[key]||0) : range ?
            (range[0]===range[1]?armor.formatStat(key,range[0]):`${range[0]}–${armor.formatStat(key,range[1])}`) : '0';
          row.append(el('span','',armor.STATS[key].name),el('strong','',value));
          const delta=item.stats ? Math.round(((item.stats[key]||0)-(current[key]||0))*1000)/1000 : 0;
          row.append(el('small',delta>0?'better':delta<0?'worse':'',delta?`${delta>0?'+':''}${delta}`:''));statRows.append(row);
        }
        const rollsStats=Object.values(item.ranges||{}).some(([low,high])=>low!==high);
        copy.append(statRows,el('p','gear-item-note',item.owned?'Bonuses apply in PvE only. Changes apply next match.':item.rarity==='exotic'?'One exotic at a time. Bonuses apply in PvE only.':`Unlocks this piece. ${rollsStats?'Stats roll once when purchased.':'Fixed stat bonuses.'} PvE bonuses only.`));
      }
      const isCurrent=equipped(activeSlot)?.id===item.id;
      const afford=(getUser()?.currencies?.Coins||0)>=item.price;
      const action=el('button','gear-item-action',item.owned?(isCurrent?'Equipped':item.kind==='none'?'Unequip':'Equip'): `Buy ${number(item.price)} Coins`);
      action.type='button';action.disabled=busy || isCurrent || (!item.owned&&!afford);
      action.addEventListener('click',()=>item.owned?equip(item):purchase(item));copy.append(action);
      if(!item.owned&&!afford)copy.append(el('span','gear-cost-note',`${number(item.price-(getUser()?.currencies?.Coins||0))} more Coins needed`));
      popup.append(dismiss,preview,copy);positionDetails();thumbnails(popup);
    }
    function fly(art, from, to) {
      if(!art || !from.width || !to.width)return;
      const ghost=el('div','gear-swap-ghost');ghost.append(art.cloneNode(true));
      Object.assign(ghost.style,{left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`});
      doc.body.append(ghost);
      const animation=ghost.animate?.([
        {transform:'translate(0,0) scale(1)',opacity:.98},
        {transform:`translate(${to.left-from.left}px,${to.top-from.top}px) scale(${to.width/from.width},${to.height/from.height})`,opacity:1},
      ],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
      if(!animation){ghost.remove();return Promise.resolve();}
      return animation.finished.catch(()=>{}).then(()=>ghost.remove());
    }
    async function equip(item) {
      if(busy || !item.owned || equipped(item.slot)?.id===item.id)return;
      const token=generation,slot=slotButtons.get(item.slot);
      const source=tileButtons.get(item.id),from=source?.getBoundingClientRect(),target=slot.getBoundingClientRect();
      const newArt=source?.querySelector('.gear-art')?.cloneNode(true);
      busy=true;root.setAttribute('aria-busy','true');say('Equipping…');if(inspected)showDetails(inspected);
      try {
        await onEquip(item);
        if(token!==generation)return;
        render();say(item.kind==='none'?`${SLOT_LABELS[item.slot]} unequipped`:`${item.name} equipped`);
        const reduced=win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if(!reduced && activeSlot===item.slot && from && root.offsetParent!==null) {
          slot.classList.add('is-swapping');
          await fly(newArt,from,target);
          slot.classList.remove('is-swapping');
        }
      } catch(error) { if(token===generation)say(error.message||'Could not equip. Try again.',true); }
      finally { busy=false;root.removeAttribute('aria-busy');if(inspected)showDetails(inspected); }
    }
    async function purchase(item) {
      if(busy || item.owned || (getUser()?.currencies?.Coins||0)<item.price)return;
      const token=generation;busy=true;root.setAttribute('aria-busy','true');say('Purchasing…');showDetails(item);
      try {
        await onPurchase(item);if(token!==generation)return;
        render();say(`${item.name} unlocked`);
        const purchased=choices(item.slot).find(value=>value.key===item.key&&value.owned);
        if(purchased && activeSlot===item.slot)showDetails(purchased);
      } catch(error) {if(token===generation)say(error.message||'Purchase failed. Try again.',true);}
      finally {busy=false;root.removeAttribute('aria-busy');if(inspected)showDetails(inspected);}
    }
    function render() {
      const previous=inspected;renderSlots();
      if(activeSlot) {
        renderGrid();positionPicker();
        if(previous){const next=choices(activeSlot).find(item=>item.id===previous.id)||choices(activeSlot).find(item=>item.key===previous.key);if(next)showDetails(next);else hideDetails();}
      }
    }
    for(const side of ['weapons','armor']) {
      const rail=byId(`loadout-${side}-rail`);rail.append(el('h2','',side==='weapons'?'Weapons':'Armor'));
      for(const slot of side==='weapons'?['primary','sidearm']:armor.SLOTS) {
        const wrap=el('div','equipment-slot-wrap'),button=el('button','equipment-slot');
        button.type='button';button.dataset.slot=slot;button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','gear-picker');
        wrap.append(button,el('span','equipment-slot-label',SLOT_LABELS[slot]));rail.append(wrap);slotButtons.set(slot,button);
        wrap.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch'){keyboard=false;open(slot);}});
        wrap.addEventListener('pointerleave',scheduleClose);
        button.addEventListener('focus',()=>{if(!ignoreFocus&&keyboard)open(slot);});
        button.addEventListener('click',()=>open(slot,keyboard));
        button.addEventListener('keydown',event=>{if(['ArrowRight','ArrowLeft','ArrowDown'].includes(event.key)){event.preventDefault();keyboard=true;open(slot,true);}});
      }
    }
    for(const panel of [picker,popup]) {
      panel.addEventListener('pointerenter',keepOpen);panel.addEventListener('pointerleave',scheduleClose);
      panel.addEventListener('focusin',()=>{if(keyboard)keepOpen();});panel.addEventListener('focusout',scheduleClose);
    }
    byId('gear-picker-close').addEventListener('click',()=>close(true));
    doc.addEventListener('keydown',event=>{
      if(event.key==='Tab'){keyboard=true;lastPointerType='keyboard';}
      if(event.key==='Escape'&&activeSlot){event.preventDefault();close(true);}
    });
    doc.addEventListener('pointerdown',event=>{keyboard=false;if(activeSlot&&!inControls(event.target))close();});
    win.addEventListener('resize',()=>{positionPicker();positionDetails();});
    win.addEventListener('scroll',event=>{if(activeSlot&&!picker.contains(event.target)&&!popup.contains(event.target))close();},true);
    return {render,close,clear(){generation++;close();say('');},appearance:()=>armor.appearance(armor.equippedItems(getUser()?.armor))};
  }
  global.createLoadoutUI=createLoadoutUI;
  if(typeof module!=='undefined'&&module.exports)module.exports={createLoadoutUI,loadoutItems,equippedItem,SLOT_LABELS,ALL_SLOTS};
})(typeof globalThis!=='undefined'?globalThis:this);
