const SHEET_HEADERS = {
  Projects: [
    'projectId',
    'projectNumber',
    'projectName',
    'manager',
    'department',
    'status',
    'priority',
    'requestDate',
    'deliveryDate',
    'notes',
    'earlyDeliveryDate',
    'earlyDeliveryNotes',
    'createdAt',
    'updatedAt'
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
    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message || String(err) }, 500);
  }
}

function jsonResponse(data, status) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  if (status) {
    output.setResponseCode(status);
  }
  return output;
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  ensureHeaderRow(sheet, SHEET_HEADERS[name]);
  return sheet;
}

function ensureHeaderRow(sheet, headers) {
  const firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn() || headers.length).getValues()[0] || [];
  const hasHeaders = headers.every((header, idx) => firstRow[idx] === header);
  if (!hasHeaders) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function getDriveRootFolder() {
  const props = PropertiesService.getScriptProperties();
  let rootId = props.getProperty(DRIVE_ROOT_PROPERTY);
  if (rootId) {
    return DriveApp.getFolderById(rootId);
  }
  const rootFolder = DriveApp.createFolder(DRIVE_ROOT_NAME);
  props.setProperty(DRIVE_ROOT_PROPERTY, rootFolder.getId());
  return rootFolder;
}

function getDepartmentFolder(projectFolder, type) {
  const deptNameMap = {
    request: '영업',
    etc: '영업',
    design: '설계',
    production: '생산',
    aftercare: 'AS'
  };
  const deptName = deptNameMap[type] || type;
  const folders = projectFolder.getFoldersByName(deptName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return projectFolder.createFolder(deptName);
}

function getProjectFolder(rootFolder, projectNumber) {
  const folderName = projectNumber || 'UNKNOWN_PROJECT';
  const folders = rootFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return rootFolder.createFolder(folderName);
}

function dataUrlToBlob(dataUrl, fileName) {
  const match = String(dataUrl || '').match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  const mimeType = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  return Utilities.newBlob(bytes, mimeType, fileName || 'file');
}

function getDriveViewUrl(fileId) {
  return fileId ? `https://drive.google.com/uc?id=${fileId}` : '';
}

function syncAll(payload) {
  const projects = Array.isArray(payload.projects) ? payload.projects : [];
  const deletedProjects = Array.isArray(payload.deletedProjects) ? payload.deletedProjects : [];
  const userName = payload.user && payload.user.name ? payload.user.name : 'system';
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const rootFolder = getDriveRootFolder();
  const existingFileIds = readFileIdsMap();
  const newFileIds = {};

  const projectRows = [];
  const workflowRows = [];
  const fileRows = [];
  const accountingRows = [];
  const modelRows = [];
  const designRows = [];
  const productionRows = [];
  const aftercareRows = [];
  const updatedProjects = [];

  projects.forEach(project => {
    const projectId = project.id || project.projectId || String(new Date().getTime());
    const projectNumber = project.projectNumber || '';
    project.id = projectId;
    project.projectId = projectId;
    project.updatedAt = project.updatedAt || new Date().toISOString();
    project.createdAt = project.createdAt || project.updatedAt;

    projectRows.push([
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
      project.updatedAt || ''
    ]);

    const workflow = project.workflow || {};
    Object.keys(workflow).forEach(dept => {
      const info = workflow[dept] || {};
      workflowRows.push([
        projectId,
        dept,
        info.completed ? 'TRUE' : 'FALSE',
        info.completedAt || '',
        info.completedBy || ''
      ]);
    });

    const projectFolder = getProjectFolder(rootFolder, projectNumber);
    const fileGroups = [
      { type: 'request', files: project.requestFiles || [] },
      { type: 'etc', files: project.etcFiles || [] },
      { type: 'design', files: (project.design && project.design.files) ? project.design.files : [] },
      { type: 'production', files: (project.production && project.production.files) ? project.production.files : [] },
      { type: 'aftercare', files: (project.aftercare && project.aftercare.files) ? project.aftercare.files : [] }
    ];

    fileGroups.forEach(group => {
      const deptFolder = getDepartmentFolder(projectFolder, group.type);
      group.files.forEach(file => {
        let fileId = file.fileId || '';
        let dataUrl = file.dataUrl || '';
        let mimeType = file.type || '';
        let size = file.size || 0;
        let uploadedAt = file.uploadedAt || '';
        if (!fileId && dataUrl) {
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

        if (fileId) {
          newFileIds[fileId] = true;
        }

        fileRows.push([
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
      accountingRows.push([
        projectId,
        project.accounting.customerName || '',
        project.accounting.requestDueDate || '',
        project.accounting.wpRequestDueDate || '',
        project.accounting.memo || ''
      ]);
      if (Array.isArray(project.accounting.models)) {
        project.accounting.models.forEach(model => {
          modelRows.push([
            projectId,
            model.serialNumber || '',
            model.modelName || '',
            model.quantity || '',
            model.wpDueDate || '',
            model.productDueDate || '',
            model.spec || ''
          ]);
        });
      }
    }

    if (project.design) {
      designRows.push([
        projectId,
        project.design.memo || '',
        project.updatedAt || ''
      ]);
    }

    if (project.production) {
      productionRows.push([
        projectId,
        project.production.memo || '',
        project.production.started ? 'TRUE' : 'FALSE',
        project.production.startedAt || '',
        project.updatedAt || ''
      ]);
    }

    if (project.aftercare) {
      aftercareRows.push([
        projectId,
        project.aftercare.memo || '',
        project.deliveryCompletedAt || '',
        project.updatedAt || ''
      ]);
    }

    updatedProjects.push(project);
  });

  trashRemovedFiles(existingFileIds, newFileIds);

  writeSheet('Projects', SHEET_HEADERS.Projects, projectRows);
  writeSheet('Workflow', SHEET_HEADERS.Workflow, workflowRows);
  writeSheet('Files', SHEET_HEADERS.Files, fileRows);
  writeSheet('Accounting', SHEET_HEADERS.Accounting, accountingRows);
  writeSheet('AccountingModels', SHEET_HEADERS.AccountingModels, modelRows);
  writeSheet('Design', SHEET_HEADERS.Design, designRows);
  writeSheet('Production', SHEET_HEADERS.Production, productionRows);
  writeSheet('Aftercare', SHEET_HEADERS.Aftercare, aftercareRows);
  writeSheet(
    'Deleted',
    SHEET_HEADERS.Deleted,
    deletedProjects.map(item => ([
      item.id || '',
      item.projectNumber || '',
      item.projectName || '',
      item.deletedAt || '',
      item.deletedBy || '',
      JSON.stringify(item || {})
    ]))
  );

  return {
    projects: updatedProjects,
    deletedProjects
  };
}

function trashRemovedFiles(existingFileIds, newFileIds) {
  Object.keys(existingFileIds).forEach(fileId => {
    if (!newFileIds[fileId]) {
      try {
        DriveApp.getFileById(fileId).setTrashed(true);
      } catch (err) {
        // ignore missing file
      }
    }
  });
}

function writeSheet(name, headers, rows) {
  const sheet = getSheet(name);
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!rows || rows.length === 0) return;
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function loadAll() {
  const projects = readProjects();
  const workflowMap = readWorkflow();
  const filesMap = readFiles();
  const accountingMap = readAccounting();
  const modelsMap = readAccountingModels();
  const designMap = readDesign();
  const productionMap = readProduction();
  const aftercareMap = readAftercare();

  const projectList = projects.map(project => {
    const projectId = project.id;
    project.workflow = workflowMap[projectId] || project.workflow || {};
    project.requestFiles = filesMap[projectId] ? (filesMap[projectId].request || []) : [];
    project.etcFiles = filesMap[projectId] ? (filesMap[projectId].etc || []) : [];
    project.accounting = accountingMap[projectId] || null;
    if (project.accounting && modelsMap[projectId]) {
      project.accounting.models = modelsMap[projectId];
    }
    project.design = designMap[projectId] || null;
    if (project.design && filesMap[projectId] && filesMap[projectId].design) {
      project.design.files = filesMap[projectId].design;
    }
    project.production = productionMap[projectId] || null;
    if (project.production && filesMap[projectId] && filesMap[projectId].production) {
      project.production.files = filesMap[projectId].production;
    }
    project.aftercare = aftercareMap[projectId] || null;
    if (project.aftercare && filesMap[projectId] && filesMap[projectId].aftercare) {
      project.aftercare.files = filesMap[projectId].aftercare;
    }
    return project;
  });

  return {
    projects: projectList,
    deletedProjects: readDeleted()
  };
}

function readProjects() {
  const sheet = getSheet('Projects');
  const values = sheet.getDataRange().getValues();
  const headers = values.shift() || [];
  return values.filter(row => row[0]).map(row => ({
    id: row[0],
    projectId: row[0],
    projectNumber: row[1] || '',
    projectName: row[2] || '',
    manager: row[3] || '',
    department: row[4] || '',
    status: row[5] || '',
    priority: row[6] || '',
    requestDate: row[7] || '',
    deliveryDate: row[8] || '',
    notes: row[9] || '',
    earlyDeliveryDate: row[10] || '',
    earlyDeliveryNotes: row[11] || '',
    createdAt: row[12] || '',
    updatedAt: row[13] || ''
  }));
}

function readWorkflow() {
  const sheet = getSheet('Workflow');
  const values = sheet.getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(row => {
    const projectId = row[0];
    if (!projectId) return;
    if (!map[projectId]) map[projectId] = {};
    map[projectId][row[1]] = {
      completed: row[2] === 'TRUE' || row[2] === true,
      completedAt: row[3] || null,
      completedBy: row[4] || null
    };
  });
  return map;
}

function readFiles() {
  const sheet = getSheet('Files');
  const values = sheet.getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(row => {
    const projectId = row[0];
    const type = row[1];
    if (!projectId || !type) return;
    if (!map[projectId]) map[projectId] = {};
    if (!map[projectId][type]) map[projectId][type] = [];
    const fileId = row[3] || '';
    map[projectId][type].push({
      name: row[2] || '',
      fileId,
      drivePath: row[4] || '',
      size: Number(row[5] || 0),
      type: row[6] || '',
      uploadedBy: row[7] || '',
      uploadedAt: row[8] || '',
      dataUrl: fileId ? getDriveViewUrl(fileId) : ''
    });
  });
  return map;
}

function readFileIdsMap() {
  const sheet = getSheet('Files');
  const values = sheet.getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(row => {
    const fileId = row[3];
    if (fileId) map[fileId] = true;
  });
  return map;
}

function readAccounting() {
  const sheet = getSheet('Accounting');
  const values = sheet.getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(row => {
    const projectId = row[0];
    if (!projectId) return;
    map[projectId] = {
      customerName: row[1] || '',
      requestDueDate: row[2] || '',
      wpRequestDueDate: row[3] || '',
      memo: row[4] || '',
      models: []
    };
  });
  return map;
}

function readAccountingModels() {
  const sheet = getSheet('AccountingModels');
  const values = sheet.getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(row => {
    const projectId = row[0];
    if (!projectId) return;
    if (!map[projectId]) map[projectId] = [];
    map[projectId].push({
      serialNumber: row[1] || '',
      modelName: row[2] || '',
      quantity: row[3] || '',
      wpDueDate: row[4] || '',
      productDueDate: row[5] || '',
      spec: row[6] || ''
    });
  });
  return map;
}

function readDesign() {
  const sheet = getSheet('Design');
  const values = sheet.getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(row => {
    const projectId = row[0];
    if (!projectId) return;
    map[projectId] = {
      memo: row[1] || '',
      files: []
    };
  });
  return map;
}

function readProduction() {
  const sheet = getSheet('Production');
  const values = sheet.getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(row => {
    const projectId = row[0];
    if (!projectId) return;
    map[projectId] = {
      memo: row[1] || '',
      started: row[2] === 'TRUE' || row[2] === true,
      startedAt: row[3] || '',
      files: []
    };
  });
  return map;
}

function readAftercare() {
  const sheet = getSheet('Aftercare');
  const values = sheet.getDataRange().getValues();
  values.shift();
  const map = {};
  values.forEach(row => {
    const projectId = row[0];
    if (!projectId) return;
    map[projectId] = {
      memo: row[1] || '',
      files: []
    };
  });
  return map;
}

function readDeleted() {
  const sheet = getSheet('Deleted');
  const values = sheet.getDataRange().getValues();
  values.shift();
  return values.map(row => ({
    id: row[0] || '',
    projectNumber: row[1] || '',
    projectName: row[2] || '',
    deletedAt: row[3] || '',
    deletedBy: row[4] || '',
    payloadJson: row[5] || ''
  }));
}
