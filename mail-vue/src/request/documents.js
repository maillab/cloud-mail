import http from '@/axios/index.js'

export function documentFoldersList() {
    return http.get('/documents/folders');
}

export function documentFoldersCreate(data) {
    return http.post('/documents/folders', data);
}

export function documentFoldersUpdate(id, data) {
    return http.put(`/documents/folders/${id}`, data);
}

export function documentFoldersDelete(id) {
    return http.delete(`/documents/folders/${id}`);
}

export function documentsList(params) {
    return http.get('/documents', { params });
}

export function documentsUpload(file, folderId) {
    const form = new FormData();
    form.append('file', file);
    if (folderId !== undefined && folderId !== null) form.append('folder_id', String(folderId));
    return http.post('/documents/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
}

export function documentsDelete(id) {
    return http.delete(`/documents/${id}`);
}