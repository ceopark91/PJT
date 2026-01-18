// ============================================
// CORS 테스트용 doGet (실제 해결은 프론트엔드에서)
// ============================================
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    error: 'Use POST method'
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// 시트 헤더 정의
// ============================================
const SHEET_HEADERS = {
  Projects: [
    'projectId', 'projectNumber', 'projectName', 'manager', 'department',
    'status', 'priority', 'requestDate', 'deliveryDate', 'notes',
    'earlyDeliveryDate', 'earlyDeliveryNotes', 'createdAt', 'updatedAt',
    'deliveryCompletedAt'
  ],
  Workflow: ['projectId', 'department', 'completed', 'completedAt', 'completedBy'],
  Files: ['projectId', 'department', 'fileName', 'fileId', 'drivePath', 'size', 'mimeType', 'uploadedBy', 'uploadedAt', 'isDeleted'],
  Accounting: ['projectId', 'customerName', 'requestDueDate', 'wpRequestDueDate', 'memo'],
  AccountingModels: ['projectId', 'serialNumber', 'modelName', 'qty', 'wpDueDate', 'productDueDate', 'spec'],
  Design: ['projectId', 'memo', 'updatedAt'],
  Production: ['projectId', 'memo', 'started', 'startedAt', 'updatedAt'],
  Aftercare: ['projectId', 'memo', 'deliveryCompletedAt', 'updatedAt'],
  Deleted: ['projectId', 'projectNumber', 'projectName', 'deletedAt', 'deletedBy', 'payloadJson']
};

const DRIVE_ROOT_PROPERTY = 'PROJECT_DRIVE_ROOT_ID';
const DRIVE_ROOT_NAME = 'Manufacturing_Project_Files';

// ============================================
// 메인 진입점
// ============================================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const action = payload.action;
    if (action === 'loadAll') {
      return jsonResponse(loadAll());
    }
    if (action === 'syncAll') {
      return jsonResponse(syncAll(payload));
    }
    return jsonResponse({ success: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || String(err) });
  }
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================
// 데이터 동기화
// ============================================
function syncAll(payload) {
  const projects = Array.isArray(payload.projects) ? payload.projects : [];
  const deletedProjects = Array.isArray(payload.deletedProjects) ? payload.deletedProjects : [];
  const userName = payload.user && payload.user.name ? payload.user.name : 'system';

  const rootFolder = getDriveRootFolder();
  const rowsMap = {
    Projects: [],
    Workflow: [],
    Files: [],
    Accounting: [],
    AccountingModels: [],
    Design: [],
    Production: [],
    Aftercare: []
  };
  const updatedProjects = [];
  const projectIds = [];

  projects.forEach(project => {
    const projectId = project.id || project.projectId || (Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    project.id = projectId;
    project.projectId = projectId;
    project.updatedAt = project.updatedAt || new Date().toISOString();
    project.createdAt = project.createdAt || project.updatedAt;
    projectIds.push(projectId);

    rowsMap.Projects.push([
      projectId,
      project.projectNumber || '',
      project.projectName || '',
      project.manager || '',
      project.department || '',
      project.status || '',
      project.priority || '',
      project.requestDate || '',
      project.deliveryDate || '',
      project.notes || '',
      project.earlyDeliveryDate || '',
      project.earlyDeliveryNotes || '',
      project.createdAt || '',
      project.updatedAt || '',
      project.deliveryCompletedAt || ''
    ]);

    const workflow = project.workflow || {};
    Object.keys(workflow).forEach(dept => {
      const info = workflow[dept] || {};
      rowsMap.Workflow.push([
        projectId,
        dept,
        info.completed ? 'TRUE' : 'FALSE',
        info.completedAt || '',
        info.completedBy || ''
      ]);
    });

    const projectFolder = getProjectFolder(rootFolder, project.projectNumber || '');
    const fileGroups = [
      { type: 'request', files: project.requestFiles || [] },
      { type: 'etc', files: project.etcFiles || [] },
      { type: 'design', files: project.design && project.design.files ? project.design.files : [] },
      { type: 'production', files: project.production && project.production.files ? project.production.files : [] },
      { type: 'aftercare', files: project.aftercare && project.aftercare.files ? project.aftercare.files : [] }
    ];

    fileGroups.forEach(group => {
      const deptFolder = getDepartmentFolder(projectFolder, group.type);
      group.files.forEach(file => {
        let fileId = file.fileId || '';
        let dataUrl = file.dataUrl || '';
        let mimeType = file.type || '';
        let size = file.size || 0;
        let uploadedAt = file.uploadedAt || '';
        
        if (!fileId && dataUrl && String(dataUrl).startsWith('data:')) {
          const blob = dataUrlToBlob(dataUrl, file.name);
          if (blob) {
            const driveFile = deptFolder.createFile(blob);
            fileId = driveFile.getId();
            mimeType = driveFile.getMimeType();
            size = driveFile.getSize();
            uploadedAt = new Date().toISOString();
          }
        } else if (fileId && !uploadedAt) {
          uploadedAt = new Date().toISOString();
        }

        const drivePath = `${rootFolder.getName()}/${projectFolder.getName()}/${deptFolder.getName()}`;
        file.fileId = fileId;
        file.type = mimeType;
        file.size = size;
        file.uploadedAt = uploadedAt;
        file.uploadedBy = file.uploadedBy || userName;
        file.drivePath = drivePath;
        file.dataUrl = fileId ? getDriveViewUrl(fileId) : '';

        rowsMap.Files.push([
          projectId,
          group.type,
          file.name || '',
          fileId || '',
          drivePath,
          size || 0,
          mimeType || '',
          file.uploadedBy || userName,
          uploadedAt || '',
          'FALSE'
        ]);
      });
    });

    if (project.accounting) {
      rowsMap.Accounting.push([
        projectId,
        project.accounting.customerName || '',
        project.accounting.requestDueDate || '',
        project.accounting.wpRequestDueDate || '',
        project.accounting.memo || ''
      ]);
      if (Array.isArray(project.accounting.models)) {
        project.accounting.models.forEach(m => {
          const quantity = m.qty || m.quantity || '';
          rowsMap.AccountingModels.push([
            projectId,
            m.serialNumber || '',
            m.modelName || '',
            quantity,
            m.wpDueDate || '',
            m.productDueDate || '',
            m.spec || ''
          ]);
        });
      }
    }

    if (project.design) {
      rowsMap.Design.push([projectId, project.design.memo || '', project.updatedAt || '']);
    }
    if (project.production) {
      rowsMap.Production.push([
        projectId,
        project.production.memo || '',
        project.production.started ? 'TRUE' : 'FALSE',
        project.production.startedAt || '',
        project.updatedAt || ''
      ]);
    }
    if (project.aftercare) {
      rowsMap.Aftercare.push([
        projectId,
        project.aftercare.memo || '',
        project.deliveryCompletedAt || '',
        project.updatedAt || ''
      ]);
    }

    updatedProjects.push(project);
  });

  Object.keys(rowsMap).forEach(sheetName => {
    upsertRowsByProjectIds(sheetName, SHEET_HEADERS[sheetName], rowsMap[sheetName], projectIds);
  });

  // 삭제 히스토리 중복 방지 (개선)
  if (deletedProjects.length > 0) {
    const existingDeleted = readDeleted();
    const existingIds = new Set(existingDeleted.map(d => d.id));
    const existingNumbers = new Set(existingDeleted.map(d => d.projectNumber));
    
    const newDeletedRows = deletedProjects
      .filter(item => {
        if (item.id && existingIds.has(item.id)) return false;
        if (item.projectNumber && existingNumbers.has(item.projectNumber)) return false;
        return true;
      })
      .map(item => ([
        item.id || (Date.now() + '-' + Math.random().toString(36).substr(2, 9)),
        item.projectNumber || '',
        item.projectName || '',
        item.deletedAt || new Date().toISOString(),
        item.deletedBy || userName,
        JSON.stringify(item || {})
      ]));
      
    if (newDeletedRows.length > 0) {
      appendRows('Deleted', SHEET_HEADERS.Deleted, newDeletedRows);
    }
  }

  return { success: true, projects: updatedProjects, deletedProjects };
}

// ============================================
// 데이터 로드
// ============================================
function loadAll() {
  const projects = readSheetData('Projects');
  const workflowMap = readWorkflowMap();
  const filesMap = readFilesMap();
  const accMap = readGenericMap('Accounting');
  const modelMap = readListMap('AccountingModels');
  const designMap = readGenericMap('Design');
  const prodMap = readGenericMap('Production');
  const asMap = readGenericMap('Aftercare');

  const projectList = projects.map(p => {
    const id = p.id;
    p.workflow = workflowMap[id] || {};
    p.requestFiles = filesMap[id] ? (filesMap[id].request || []) : [];
    p.etcFiles = filesMap[id] ? (filesMap[id].etc || []) : [];
    p.accounting = accMap[id] || null;
    if (p.accounting) p.accounting.models = modelMap[id] || [];
    p.design = designMap[id] || null;
    if (p.design) p.design.files = filesMap[id] ? (filesMap[id].design || []) : [];
    p.production = prodMap[id] || null;
    if (p.production) p.production.files = filesMap[id] ? (filesMap[id].production || []) : [];
    p.aftercare = asMap[id] || null;
    if (p.aftercare) p.aftercare.files = filesMap[id] ? (filesMap[id].aftercare || []) : [];
    return p;
  });

  return { success: true, projects: projectList, deletedProjects: readDeleted() };
}

// ============================================
// 안전한 Upsert
// ============================================
function upsertRowsByProjectIds(name, headers, newRows, projectIds) {
  if (!projectIds || projectIds.length === 0) return;
  const sheet = getSheet(name);
  const idIdx = headers.indexOf('projectId');
  if (idIdx === -1) return;
  
  const lastRow = sheet.getLastRow();
  let finalData = [];
  const targetIds = new Set(projectIds.map(String));

  if (lastRow > 1) {
    const existingData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    finalData = existingData.filter(row => row[idIdx] && !targetIds.has(String(row[idIdx])));
  }
  
  if (newRows && newRows.length > 0) {
    finalData = finalData.concat(newRows);
  }
  
  if (lastRow > 1) {
    const rowsToDelete = lastRow - 1;
    if (rowsToDelete > 0) {
      sheet.deleteRows(2, rowsToDelete);
    }
  }
  
  if (finalData.length > 0) {
    sheet.getRange(2, 1, finalData.length, headers.length).setValues(finalData);
  }
}

// ============================================
// 시트 관리
// ============================================
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  ensureHeaderRow(sheet, SHEET_HEADERS[name]);
  return sheet;
}

function appendRows(name, headers, rows) {
  if (!rows || rows.length === 0) return;
  const sheet = getSheet(name);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

// 안전한 헤더 관리 (데이터 유지!)
function ensureHeaderRow(sheet, headers) {
  const lastCol = sheet.getLastColumn();
  
  if (lastCol === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  
  const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  
  const needsUpdate = headers.some((header, idx) => existingHeaders[idx] !== header);
  if (!needsUpdate && lastCol >= headers.length) {
    return;
  }
  
  if (headers.length > lastCol) {
    const newHeaders = headers.slice(lastCol);
    if (newHeaders.length > 0) {
      sheet.getRange(1, lastCol + 1, 1, newHeaders.length).setValues([newHeaders]);
    }
  }
  
  headers.forEach((header, idx) => {
    if (existingHeaders[idx] !== header) {
      sheet.getRange(1, idx + 1).setValue(header);
    }
  });
}

// ============================================
// Drive 관리
// ============================================
function getDriveRootFolder() {
  const props = PropertiesService.getScriptProperties();
  let rootId = props.getProperty(DRIVE_ROOT_PROPERTY);
  if (rootId) {
    try {
      return DriveApp.getFolderById(rootId);
    } catch (err) {}
  }
  const rootFolder = DriveApp.createFolder(DRIVE_ROOT_NAME);
  props.setProperty(DRIVE_ROOT_PROPERTY, rootFolder.getId());
  return rootFolder;
}

function getProjectFolder(rootFolder, pNum) {
  const name = pNum || 'UNKNOWN';
  const folders = rootFolder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : rootFolder.createFolder(name);
}

function getDepartmentFolder(pFolder, type) {
  const map = { 
    request: '영업', 
    etc: '영업', 
    design: '설계', 
    production: '생산', 
    aftercare: 'AS' 
  };
  const name = map[type] || type;
  const folders = pFolder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : pFolder.createFolder(name);
}

function dataUrlToBlob(url, name) {
  const match = String(url || '').match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  return Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], name || 'file');
}

function getDriveViewUrl(fileId) {
  return fileId ? `https://drive.google.com/uc?id=${fileId}` : '';
}

// ============================================
// 데이터 읽기
// ============================================
function readSheetData(name) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  values.shift();
  return values.filter(r => r[0]).map(r => ({
    id: r[0],
    projectId: r[0],
    projectNumber: r[1],
    projectName: r[2],
    manager: r[3],
    department: r[4],
    status: r[5],
    priority: r[6],
    requestDate: r[7],
    deliveryDate: r[8],
    notes: r[9],
    earlyDeliveryDate: r[10],
    earlyDeliveryNotes: r[11],
    createdAt: r[12],
    updatedAt: r[13],
    deliveryCompletedAt: r[14] || null
  }));
}

function readWorkflowMap() {
  const values = getSheet('Workflow').getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(r => {
    if (!r[0]) return;
    if (!map[r[0]]) map[r[0]] = {};
    map[r[0]][r[1]] = {
      completed: r[2] === 'TRUE' || r[2] === true,
      completedAt: r[3],
      completedBy: r[4]
    };
  });
  return map;
}

function readFilesMap() {
  const values = getSheet('Files').getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(r => {
    if (!r[0]) return;
    if (!map[r[0]]) map[r[0]] = {};
    if (!map[r[0]][r[1]]) map[r[0]][r[1]] = [];
    map[r[0]][r[1]].push({
      name: r[2],
      fileId: r[3],
      drivePath: r[4],
      size: Number(r[5] || 0),
      type: r[6],
      uploadedBy: r[7],
      uploadedAt: r[8],
      dataUrl: r[3] ? getDriveViewUrl(r[3]) : ''
    });
  });
  return map;
}

function readGenericMap(name) {
  const values = getSheet(name).getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(r => {
    if (!r[0]) return;
    if (name === 'Accounting') {
      map[r[0]] = { customerName: r[1], requestDueDate: r[2], wpRequestDueDate: r[3], memo: r[4] };
    }
    if (name === 'Design') {
      map[r[0]] = { memo: r[1] };
    }
    if (name === 'Production') {
      map[r[0]] = { memo: r[1], started: r[2] === 'TRUE' || r[2] === true, startedAt: r[3] };
    }
    if (name === 'Aftercare') {
      map[r[0]] = { memo: r[1] };
    }
  });
  return map;
}

function readListMap(name) {
  const values = getSheet(name).getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(r => {
    if (!r[0]) return;
    if (!map[r[0]]) map[r[0]] = [];
    map[r[0]].push({
      serialNumber: r[1],
      modelName: r[2],
      qty: r[3],
      quantity: r[3],
      wpDueDate: r[4],
      productDueDate: r[5],
      spec: r[6]
    });
  });
  return map;
}

function readDeleted() {
  const values = getSheet('Deleted').getDataRange().getValues();
  values.shift();
  return values.map(r => ({
    id: r[0],
    projectNumber: r[1],
    projectName: r[2],
    deletedAt: r[3],
    deletedBy: r[4],
    payloadJson: r[5]
  }));
}
