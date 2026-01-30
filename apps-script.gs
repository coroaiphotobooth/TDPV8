

/**
 * BACKEND UNTUK CORO AI PHOTOBOOTH - FINAL
 * Fitur: Session, Queue, Large Config Storage (Drive File)
 */

const SCRIPT_PROP = PropertiesService.getScriptProperties();

function getOrInitSpreadsheet() {
  let ss = null;
  const ssId = SCRIPT_PROP.getProperty('SPREADSHEET_ID');
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch(e) {}
  }
  if (!ss) {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Coro AI Photobooth Database');
    SCRIPT_PROP.setProperty('SPREADSHEET_ID', ss.getId());
    ensureGallerySheet(ss);
  }
  return ss;
}

function ensureGallerySheet(ss) {
  let gallerySheet = ss.getSheetByName('Gallery');
  const headersList = ['id', 'createdAt', 'conceptName', 'imageUrl', 'downloadUrl', 'token', 'eventId', 'type', 'originalId', 'providerUrl', 'relatedPhotoId', 'sessionFolderId', 'sessionFolderUrl', 'videoStatus', 'videoTaskId', 'videoPrompt', 'videoFileId', 'videoResolution', 'videoModel'];
  
  if (!gallerySheet) {
    gallerySheet = ss.insertSheet('Gallery');
    gallerySheet.appendRow(headersList);
    gallerySheet.getRange(1, 1, 1, headersList.length).setFontWeight("bold").setBackground("#bc13fe").setFontColor("white");
  } else {
    const lastCol = gallerySheet.getLastColumn();
    if (lastCol > 0) {
      const currentHeaders = gallerySheet.getRange(1, 1, 1, lastCol).getValues()[0];
      headersList.forEach((h) => {
        if (!currentHeaders.includes(h)) {
          const newCol = gallerySheet.getLastColumn() + 1;
          gallerySheet.getRange(1, newCol).setValue(h).setFontWeight("bold").setBackground("#bc13fe").setFontColor("white");
        }
      });
    }
  }
  return gallerySheet;
}

function getConceptsData() {
  const fileId = SCRIPT_PROP.getProperty('CONCEPTS_FILE_ID');
  if (fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      const json = file.getBlob().getDataAsString();
      return JSON.parse(json);
    } catch (e) {}
  }
  const prop = SCRIPT_PROP.getProperty('CONCEPTS_JSON');
  return prop ? JSON.parse(prop) : null;
}

function saveConceptsData(concepts) {
  const json = JSON.stringify(concepts);
  let fileId = SCRIPT_PROP.getProperty('CONCEPTS_FILE_ID');
  let file;
  if (fileId) {
    try {
      file = DriveApp.getFileById(fileId);
      file.setContent(json);
    } catch(e) { file = null; }
  }
  if (!file) {
    file = DriveApp.createFile('coro_concepts_config.json', json);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    SCRIPT_PROP.setProperty('CONCEPTS_FILE_ID', file.getId());
  }
  SCRIPT_PROP.deleteProperty('CONCEPTS_JSON');
}

function doGet(e) {
  const action = e.parameter.action;
  const ss = getOrInitSpreadsheet(); 
  
  if (action === 'getSettings') {
    const storedConcepts = getConceptsData();
    return createJsonResponse({
      ok: true,
      settings: {
        eventName: SCRIPT_PROP.getProperty('EVENT_NAME') || 'COROAI PHOTOBOOTH',
        eventDescription: SCRIPT_PROP.getProperty('EVENT_DESC') || 'Transform Your Reality',
        folderId: SCRIPT_PROP.getProperty('FOLDER_ID') || '',
        originalFolderId: SCRIPT_PROP.getProperty('ORIGINAL_FOLDER_ID') || '',
        spreadsheetId: ss.getId(), 
        spreadsheetUrl: ss.getUrl(), 
        overlayImage: SCRIPT_PROP.getProperty('OVERLAY_IMAGE') || null,
        backgroundImage: SCRIPT_PROP.getProperty('BACKGROUND_IMAGE') || null,
        backgroundVideoUrl: SCRIPT_PROP.getProperty('BACKGROUND_VIDEO') || null,
        backgroundAudio: SCRIPT_PROP.getProperty('BACKGROUND_AUDIO') || null,
        videoPrompt: SCRIPT_PROP.getProperty('VIDEO_PROMPT') || 'Cinematic slow motion',
        boothMode: SCRIPT_PROP.getProperty('BOOTH_MODE') || 'video',
        videoResolution: SCRIPT_PROP.getProperty('VIDEO_RESOLUTION') || '480p', 
        videoModel: SCRIPT_PROP.getProperty('VIDEO_MODEL') || 'seedance-1-0-pro-fast-251015', 
        monitorImageSize: SCRIPT_PROP.getProperty('MONITOR_IMG_SIZE') || 'medium',
        monitorTheme: SCRIPT_PROP.getProperty('MONITOR_THEME') || 'physics',
        gptModelSize: SCRIPT_PROP.getProperty('GPT_MODEL_SIZE') || '1024',
        adminPin: SCRIPT_PROP.getProperty('ADMIN_PIN') || '1234',
        autoResetTime: parseInt(SCRIPT_PROP.getProperty('AUTO_RESET')) || 60,
        orientation: SCRIPT_PROP.getProperty('ORIENTATION') || 'portrait',
        outputRatio: SCRIPT_PROP.getProperty('OUTPUT_RATIO') || '9:16',
        cameraRotation: parseInt(SCRIPT_PROP.getProperty('CAMERA_ROTATION')) || 0,
        promptMode: SCRIPT_PROP.getProperty('PROMPT_MODE') || 'wrapped'
      },
      concepts: storedConcepts
    });
  }

  if (action === 'gallery') {
    const sheet = ss.getSheetByName('Gallery');
    if (!sheet) return createJsonResponse({ items: [] });
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return createJsonResponse({ items: [] });
    const headers = values[0];
    const idIndex = headers.indexOf('id');
    const items = values.slice(1).filter(row => idIndex !== -1 && row[idIndex]).map(row => {
        let obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
    });
    return createJsonResponse({ items: items.reverse() }); 
  }
  
  if (action === 'getBase64') {
    const id = e.parameter.id;
    try {
      const file = DriveApp.getFileById(id);
      const blob = file.getBlob();
      const b64 = Utilities.base64Encode(blob.getBytes());
      return createJsonResponse({ ok: true, base64: `data:${blob.getContentType()};base64,${b64}` });
    } catch (err) {
      return createJsonResponse({ ok: false, error: "File not found" });
    }
  }

  return createJsonResponse({ ok: true, message: "Coro AI API Active" });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(30000); 

  if (!hasLock) {
    return createJsonResponse({ ok: false, error: 'Server busy. Please try again.' });
  }

  try {
      let data;
      try { data = JSON.parse(e.postData.contents); } 
      catch (err) { return createJsonResponse({ ok: false, error: 'Invalid JSON' }); }
      
      const action = data.action;
      const ss = getOrInitSpreadsheet();
      const adminPin = SCRIPT_PROP.getProperty('ADMIN_PIN') || "1234";
      
      if (action === 'updateConcepts') {
          if (String(data.pin) !== String(adminPin)) return createJsonResponse({ ok: false, error: 'INVALID PIN' });
          if (data.concepts) {
            saveConceptsData(data.concepts);
            return createJsonResponse({ ok: true, message: 'Concepts updated successfully' });
          }
          return createJsonResponse({ ok: false, error: 'No concepts data provided' });
      }

      if (action === 'createSession') {
        const parentId = SCRIPT_PROP.getProperty('FOLDER_ID');
        let parentFolder;
        try { parentFolder = DriveApp.getFolderById(parentId); } 
        catch(e) { parentFolder = DriveApp.getRootFolder(); }
        const timestamp = new Date();
        const folderName = `Session_${Utilities.formatDate(timestamp, "GMT+7", "yyyyMMdd_HHmmss")}`;
        const newFolder = parentFolder.createFolder(folderName);
        newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return createJsonResponse({ ok: true, folderId: newFolder.getId(), folderUrl: newFolder.getUrl() });
      }

      // --- ACTION: FINALIZE VIDEO UPLOAD (SERVER-TO-SERVER) ---
      if (action === 'finalizeVideoUpload') {
         const photoId = data.photoId; 
         const videoUrl = data.videoUrl;
         const sessionFolderId = data.sessionFolderId;
         
         if (!photoId || !videoUrl) return createJsonResponse({ ok: false, error: "Missing photoId or videoUrl" });

         const gallerySheet = ensureGallerySheet(ss);
         const dataRange = gallerySheet.getDataRange();
         const values = dataRange.getValues();
         const headers = values[0];
         
         const idIndex = headers.indexOf('id');
         const statusIndex = headers.indexOf('videoStatus');
         const fileIdIndex = headers.indexOf('videoFileId');
         
         let targetRowIndex = -1;
         
         for (let i = 1; i < values.length; i++) {
             if (values[i][idIndex] === photoId) {
                 targetRowIndex = i + 1;
                 
                 // IDEMPOTENCY CHECK: STRICTER
                 // Check if videoFileId is already present (column index: fileIdIndex)
                 // If ID exists, we consider it done/finalized, so we avoid re-downloading.
                 const existingFileId = values[i][fileIdIndex];
                 if (existingFileId && String(existingFileId).trim() !== "") {
                     // Ensure status is consistent
                     if (values[i][statusIndex] !== 'done') {
                         gallerySheet.getRange(targetRowIndex, statusIndex + 1).setValue('done');
                     }
                     return createJsonResponse({ ok: true, message: "Already finalized", fileId: existingFileId });
                 }
                 break;
             }
         }

         if (targetRowIndex === -1) return createJsonResponse({ ok: false, error: "Row not found" });

         try {
             // CRITICAL UPDATE: Add User-Agent to allow downloading from providers that block bots
             const videoRes = UrlFetchApp.fetch(videoUrl, { 
                muteHttpExceptions: true,
                followRedirects: true,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
             });
             
             if (videoRes.getResponseCode() !== 200) {
                 throw new Error("Failed to fetch video: " + videoRes.getResponseCode());
             }
             
             const videoBlob = videoRes.getBlob();
             videoBlob.setName(`VIDEO_${new Date().getTime()}.mp4`);
             
             // Save to Drive
             let folder;
             if (sessionFolderId) {
                 try { folder = DriveApp.getFolderById(sessionFolderId); } catch(e) {}
             }
             if (!folder) {
                 const defaultFolderId = SCRIPT_PROP.getProperty('FOLDER_ID');
                 try { folder = DriveApp.getFolderById(defaultFolderId); } 
                 catch(e) { folder = DriveApp.getRootFolder(); }
             }
             
             const file = folder.createFile(videoBlob);
             file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
             
             // Update Sheet (videoStatus -> 'done')
             gallerySheet.getRange(targetRowIndex, statusIndex + 1).setValue('done');
             gallerySheet.getRange(targetRowIndex, fileIdIndex + 1).setValue(file.getId());
             
             return createJsonResponse({ ok: true, fileId: file.getId() });

         } catch (e) {
             // We return error but do NOT mark as failed in sheet, 
             // allowing 'ready_url' to persist for proxy playback (fallback)
             return createJsonResponse({ ok: false, error: e.toString() });
         }
      }

      if (action === 'uploadGenerated' || action === 'uploadGeneratedVideo') {
        const skipGallery = data.skipGallery === true;
        let gallerySheet;
        if (!skipGallery) gallerySheet = ensureGallerySheet(ss);
        const isVideo = action === 'uploadGeneratedVideo';
        const targetFolderId = data.folderId || SCRIPT_PROP.getProperty('FOLDER_ID');
        let folder;
        try { folder = DriveApp.getFolderById(targetFolderId); } 
        catch(e) { folder = DriveApp.getRootFolder(); }
        
        let blob;
        if (isVideo) {
          blob = Utilities.newBlob(Utilities.base64Decode(data.image.split(',')[1]), 'video/mp4', `VIDEO_${new Date().getTime()}.mp4`);
        } else {
          blob = Utilities.newBlob(Utilities.base64Decode(data.image.split(',')[1]), 'image/png', `PHOTO_${new Date().getTime()}.png`);
        }

        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        if (!skipGallery && gallerySheet) {
          const headers = gallerySheet.getRange(1, 1, 1, gallerySheet.getLastColumn()).getValues()[0];
          const rowData = new Array(headers.length).fill("");
          const map = {
            'id': file.getId(),
            'createdAt': new Date().toISOString(),
            'conceptName': data.conceptName,
            'imageUrl': `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w1000`,
            'downloadUrl': `https://drive.google.com/file/d/${file.getId()}/view`,
            'token': Utilities.getUuid(),
            'type': isVideo ? 'video' : 'image',
            'originalId': data.originalId || "", 
            'relatedPhotoId': data.relatedPhotoId || "",
            'sessionFolderId': data.sessionFolderId || "",
            'sessionFolderUrl': data.sessionFolderUrl || "",
            'videoStatus': isVideo ? 'done' : 'idle',
            'videoFileId': isVideo ? file.getId() : ""
          };
          headers.forEach((h, i) => { if (map[h] !== undefined) rowData[i] = map[h]; });
          gallerySheet.appendRow(rowData);
        }
        return createJsonResponse({ ok: true, id: file.getId() });
      }

      if (action === 'queueVideo') {
         const gallerySheet = ensureGallerySheet(ss);
         const dataRange = gallerySheet.getDataRange();
         const values = dataRange.getValues();
         const headers = values[0];
         const idIndex = headers.indexOf('id');
         const statusIndex = headers.indexOf('videoStatus');
         const promptIndex = headers.indexOf('videoPrompt');
         const resIndex = headers.indexOf('videoResolution');
         const modelIndex = headers.indexOf('videoModel');
         
         for (let i = 1; i < values.length; i++) {
             if (values[i][idIndex] === data.photoId) {
                 const row = i + 1;
                 gallerySheet.getRange(row, statusIndex + 1).setValue('queued');
                 if (data.prompt) gallerySheet.getRange(row, promptIndex + 1).setValue(data.prompt);
                 if (data.resolution) gallerySheet.getRange(row, resIndex + 1).setValue(data.resolution);
                 if (data.model) gallerySheet.getRange(row, modelIndex + 1).setValue(data.model);
                 return createJsonResponse({ ok: true });
             }
         }
         return createJsonResponse({ ok: false, error: 'Photo ID not found' });
      }

      if (action === 'updateVideoStatus') {
         const gallerySheet = ensureGallerySheet(ss);
         const dataRange = gallerySheet.getDataRange();
         const values = dataRange.getValues();
         const headers = values[0];
         const idIndex = headers.indexOf('id');
         const statusIndex = headers.indexOf('videoStatus');
         const taskIndex = headers.indexOf('videoTaskId');
         const providerUrlIndex = headers.indexOf('providerUrl');
         
         for (let i = 1; i < values.length; i++) {
             if (values[i][idIndex] === data.photoId) {
                 const row = i + 1;
                 if (data.status) gallerySheet.getRange(row, statusIndex + 1).setValue(data.status);
                 if (data.taskId) gallerySheet.getRange(row, taskIndex + 1).setValue(data.taskId);
                 if (data.providerUrl) gallerySheet.getRange(row, providerUrlIndex + 1).setValue(data.providerUrl);
                 return createJsonResponse({ ok: true });
             }
         }
         return createJsonResponse({ ok: false, error: 'Photo ID not found' });
      }

      if (action === 'deletePhoto') {
          const gallerySheet = ensureGallerySheet(ss);
          const dataRange = gallerySheet.getDataRange();
          const values = dataRange.getValues();
          const headers = values[0];
          const idIndex = headers.indexOf('id');
          if (idIndex === -1) return createJsonResponse({ ok: false, error: 'ID column not found in sheet' });
          const targetId = String(data.id).trim();
          for (let i = 1; i < values.length; i++) {
             const rowId = String(values[i][idIndex]).trim();
             if (rowId === targetId) {
                 gallerySheet.deleteRow(i + 1);
                 return createJsonResponse({ ok: true });
             }
          }
          return createJsonResponse({ ok: false, error: `ID ${targetId} not found in sheet` });
      }

      if (action === 'deleteAllPhotos') {
          if (String(data.pin) !== String(adminPin)) return createJsonResponse({ ok: false, error: 'INVALID PIN' });
          const gallerySheet = ensureGallerySheet(ss);
          const lastRow = gallerySheet.getLastRow();
          if (lastRow > 1) {
             gallerySheet.deleteRows(2, lastRow - 1);
          }
          return createJsonResponse({ ok: true });
      }

      if (action === 'updateSettings') {
          if (String(data.pin) !== String(adminPin)) return createJsonResponse({ ok: false, error: 'INVALID PIN' });
          const s = data.settings;
          if (s.eventName) SCRIPT_PROP.setProperty('EVENT_NAME', s.eventName);
          if (s.eventDescription) SCRIPT_PROP.setProperty('EVENT_DESC', s.eventDescription);
          if (s.folderId) SCRIPT_PROP.setProperty('FOLDER_ID', s.folderId);
          if (s.originalFolderId) SCRIPT_PROP.setProperty('ORIGINAL_FOLDER_ID', s.originalFolderId);
          if (s.adminPin) SCRIPT_PROP.setProperty('ADMIN_PIN', s.adminPin);
          if (s.boothMode) SCRIPT_PROP.setProperty('BOOTH_MODE', s.boothMode);
          if (s.overlayImage) SCRIPT_PROP.setProperty('OVERLAY_IMAGE', s.overlayImage);
          if (s.backgroundImage) SCRIPT_PROP.setProperty('BACKGROUND_IMAGE', s.backgroundImage);
          if (s.backgroundVideoUrl !== undefined) SCRIPT_PROP.setProperty('BACKGROUND_VIDEO', s.backgroundVideoUrl || '');
          if (s.backgroundAudio) SCRIPT_PROP.setProperty('BACKGROUND_AUDIO', s.backgroundAudio);
          if (s.videoPrompt) SCRIPT_PROP.setProperty('VIDEO_PROMPT', s.videoPrompt);
          if (s.videoResolution) SCRIPT_PROP.setProperty('VIDEO_RESOLUTION', s.videoResolution);
          if (s.videoModel) SCRIPT_PROP.setProperty('VIDEO_MODEL', s.videoModel);
          if (s.monitorImageSize) SCRIPT_PROP.setProperty('MONITOR_IMG_SIZE', s.monitorImageSize);
          if (s.monitorTheme) SCRIPT_PROP.setProperty('MONITOR_THEME', s.monitorTheme);
          if (s.gptModelSize) SCRIPT_PROP.setProperty('GPT_MODEL_SIZE', s.gptModelSize);
          if (s.autoResetTime) SCRIPT_PROP.setProperty('AUTO_RESET', String(s.autoResetTime));
          if (s.orientation) SCRIPT_PROP.setProperty('ORIENTATION', s.orientation);
          if (s.outputRatio) SCRIPT_PROP.setProperty('OUTPUT_RATIO', s.outputRatio);
          if (s.cameraRotation !== undefined) SCRIPT_PROP.setProperty('CAMERA_ROTATION', String(s.cameraRotation));
          if (s.promptMode) SCRIPT_PROP.setProperty('PROMPT_MODE', s.promptMode);
          return createJsonResponse({ ok: true });
      }

      if (action === 'uploadOverlay' || action === 'uploadBackground' || action === 'uploadAudio') {
          if (String(data.pin) !== String(adminPin)) return createJsonResponse({ ok: false, error: 'INVALID PIN' });
          const parentId = SCRIPT_PROP.getProperty('FOLDER_ID');
          let parentFolder;
          try { parentFolder = DriveApp.getFolderById(parentId); } 
          catch(e) { parentFolder = DriveApp.getRootFolder(); }
          const mimeType = action === 'uploadAudio' ? 'audio/mpeg' : 'image/png'; 
          const suffix = action === 'uploadAudio' ? 'AUDIO' : (action === 'uploadOverlay' ? 'OVERLAY' : 'BG');
          const blob = Utilities.newBlob(Utilities.base64Decode(data.image.split(',')[1]), mimeType, `ASSET_${suffix}_${new Date().getTime()}`);
          const file = parentFolder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          return createJsonResponse({ ok: true, url: `https://drive.google.com/uc?export=view&id=${file.getId()}` });
      }

      return createJsonResponse({ ok: false, error: 'Unknown Action' });

  } catch (e) {
      return createJsonResponse({ ok: false, error: e.toString() });
  } finally {
      if (hasLock) lock.releaseLock();
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
