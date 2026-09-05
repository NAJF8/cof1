import re

with open("admin.html", "r", encoding="utf-8") as f:
    content = f.read()

# Replace addSongCategory
old_add = """function addSongCategory() {
  if (!can('manage_settings') && currentRole !== 'super_admin' && currentRole !== 'admin') return alert('ليس لديك صلاحية.');
  const name = document.getElementById('newSongCatName')?.value?.trim();
  if (!name) return alert('أدخل اسم التصنيف.');
  const ref = db.ref('song_categories').push();
  ref.set({ id: ref.key, name, createdAt: firebase.database.ServerValue.TIMESTAMP }).then(() => {
    document.getElementById('newSongCatName').value = '';
    showNotif('تمت إضافة التصنيف.');
  }).catch(e => showNotif('خطأ: ' + e.message, 'error'));
}"""

new_add = """async function addSongCategory() {
  if (!can('manage_settings') && currentRole !== 'super_admin' && currentRole !== 'admin') return alert('ليس لديك صلاحية.');
  const name = document.getElementById('newSongCatName')?.value?.trim();
  if (!name) return alert('أدخل اسم التصنيف.');
  const ref = db.ref('song_categories').push();
  const targetPath = `song_categories/${ref.key}`;
  console.log('[CATEGORY_WRITE_START]', targetPath);
  try {
    await ref.set({ id: ref.key, name, enabled:true, order:songCategoriesDB.length+1, createdAt: firebase.database.ServerValue.TIMESTAMP });
    const persisted = await ref.once('value');
    if(!persisted.exists() || persisted.val()?.name !== name) throw new Error('Category write was not acknowledged by Firebase');
    document.getElementById('newSongCatName').value = '';
    console.log('[CATEGORY_WRITE_SUCCESS]', targetPath);
    showNotif('تمت إضافة التصنيف.');
  } catch(e) {
    console.log('[CATEGORY_WRITE_FAILED]', {
      code: e?.code,
      message: e?.message,
      uid: auth.currentUser?.uid,
      currentRole: currentRole,
      targetPath: targetPath
    });
    showNotif('تعذر حفظ تصنيف الأغاني: '+(e?.message||'خطأ غير معروف'), 'error');
  }
}"""

content = content.replace(old_add, new_add)

# Replace saveSong
old_save = """function saveSong() {
  if (!can('manage_settings') && currentRole !== 'super_admin' && currentRole !== 'admin') return alert('ليس لديك صلاحية.');
  const id = document.getElementById('songId')?.value;
  const title = document.getElementById('songTitle')?.value?.trim();
  const categoryId = document.getElementById('songCategorySelect')?.value || '';
  const category = songCategoriesDB.find(item=>item.id===categoryId)?.name || '';
  const url = document.getElementById('songUrl')?.value?.trim();
  const artist = document.getElementById('songArtist')?.value?.trim() || '';
  
  if (!title || !url || !categoryId || !category) return alert('أدخل اسم الأغنية والتصنيف ورابط الصوت.');
  
  const ref = db.ref('songs/' + (id || db.ref('songs').push().key));
  ref.set({
    id: ref.key,
    title,
    categoryId,
    category,
    url,
    artist,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).then(() => {
    resetSongForm();
    showNotif('تم حفظ الأغنية بنجاح.');
  }).catch(e => showNotif('خطأ: ' + e.message, 'error'));
}"""

new_save = """async function saveSong() {
  if (!can('manage_settings') && currentRole !== 'super_admin' && currentRole !== 'admin') return alert('ليس لديك صلاحية.');
  const id = document.getElementById('songId')?.value;
  const title = document.getElementById('songTitle')?.value?.trim();
  const categoryId = document.getElementById('songCategorySelect')?.value || '';
  const category = songCategoriesDB.find(item=>item.id===categoryId)?.name || '';
  const url = document.getElementById('songUrl')?.value?.trim();
  const artist = document.getElementById('songArtist')?.value?.trim() || '';
  
  if (!title || !url || !categoryId || !category) return alert('أدخل اسم الأغنية والتصنيف ورابط الصوت.');
  
  const ref = db.ref('songs/' + (id || db.ref('songs').push().key));
  const targetPath = `songs/${ref.key}`;
  console.log('[SONG_WRITE_START]', targetPath);
  try {
    const songData={
      id: ref.key,
      title,
      categoryId,
      category,
      url,
      audioUrl: url,
      artist,
      enabled:true,
      order:Number(songsDB.find(item=>item.id===ref.key)?.order)||songsDB.length+1,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    if(!id) {
      songData.createdAt = firebase.database.ServerValue.TIMESTAMP;
      await ref.set(songData);
    } else {
      await ref.update(songData);
    }
    const persisted = await ref.once('value');
    if(!persisted.exists() || persisted.val()?.audioUrl !== url) throw new Error('Song write was not acknowledged by Firebase');
    resetSongForm();
    console.log('[SONG_WRITE_SUCCESS]', targetPath);
    showNotif('تم حفظ الأغنية بنجاح.');
  } catch(e) {
    console.log('[SONG_WRITE_FAILED]', {
      code: e?.code,
      message: e?.message,
      uid: auth.currentUser?.uid,
      currentRole: currentRole,
      targetPath: targetPath
    });
    showNotif('تعذر حفظ الأغنية: '+(e?.message||'خطأ غير معروف'),'error');
  }
}"""

content = content.replace(old_save, new_save)

with open("admin.html", "w", encoding="utf-8") as f:
    f.write(content)
