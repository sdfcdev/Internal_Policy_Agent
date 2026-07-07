import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

const API = axios.create({
  baseURL: API_URL,
  timeout: 600_000, // 10 minutes to allow large PDFs to parse
});

export async function sendChat(query, employeeId) {
  const { data } = await API.post('/chat', { query, employee_id: employeeId });
  return data;
}

export async function uploadPdf(file, adminId, startDate, expireDate, department = 'General', allowedEmails = '', allowedGroups = '', onProgress) {
  const form = new FormData();
  form.append('file', file);
  form.append('admin_id', adminId || 'System');
  form.append('department', department);
  form.append('allowed_emails', allowedEmails);
  form.append('allowed_groups', allowedGroups);
  if (startDate) form.append('start_date', startDate);
  if (expireDate) form.append('expire_date', expireDate);
  
  const { data } = await API.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  return data;
}

export async function getDocuments() {
  const { data } = await API.get('/admin/documents');
  return data;
}

export async function getUserDocuments(username) {
  const { data } = await API.get(`/user/documents/${username}`);
  return data;
}

export async function getDocumentCount() {
  const { data } = await API.get('/documents');
  return data;
}

export async function healthCheck() {
  const { data } = await API.get('/health');
  return data;
}

// -- NWE -- 

export async function getChatHistory(employeeId) {
  const { data } = await API.get(`/history/${employeeId}`);
  return data;
}

export async function saveHistorySession(sessionId) {
  const { data } = await API.put(`/history/save/${sessionId}`);
  return data;
}

export async function renameHistorySession(sessionId, title) {
  const { data } = await API.put(`/history/rename/${sessionId}`, { title });
  return data;
}

export async function togglePinSession(sessionId, pin) {
  const { data } = await API.put(`/history/pin/${sessionId}`, { pin });
  return data;
}

export async function deleteSession(sessionId) {
  const { data } = await API.delete(`/history/delete/${sessionId}`);
  return data;
}

export async function getAdminLogs() {
  const { data } = await API.get('/admin/logs');
  return data;
}

export async function getIntelligenceAudit() {
  const { data } = await API.get('/admin/intelligence-audit');
  return data;
}

export async function getChunks() {
  const { data } = await API.get('/admin/chunks');
  return data;
}

export async function deleteDocument(filename, admin_id) {
  const { data } = await API.delete(`/admin/document/${filename}?admin_id=${admin_id}`);
  return data;
}

export async function renameDocument(old_filename, new_filename, admin_id) {
  const { data } = await API.post(`/admin/document/rename`, { old_filename, new_filename, admin_id });
  return data;
}

export async function updateDocument(filename, start_date, expire_date, department, allowed_emails, allowed_groups, admin_id) {
  const { data } = await API.put(`/admin/document/update`, { filename, start_date, expire_date, department, allowed_emails, allowed_groups, admin_id });
  return data;
}

export async function getAccounts() {
  const { data } = await API.get('/admin/account');
  return data;
}

export async function addAccount(username, role, name, emp_num, department, admin_id) {
  const { data } = await API.post('/admin/account', { username, role, name, emp_num, department, admin_id });
  return data;
}

export async function deleteAccount(username, admin_id) {
  const { data } = await API.delete(`/admin/account/${username}?admin_id=${admin_id}`);
  return data;
}

export async function updateAccount(username, role, name, preferred_name, emp_num, department, password, admin_id) {
  const { data } = await API.put(`/admin/account/${username}`, { role, name, preferred_name, emp_num, department, password, admin_id });
  return data;
}

export async function login(username, password) {
  const { data } = await API.post('/auth/login', { username, password });
  return data;
}

export async function googleLogin(credential) {
  const { data } = await API.post('/auth/google', { credential });
  return data;
}

export async function register(username, password, name, q1, a1, q2, a2, q3, a3) {
  const { data } = await API.post('/auth/register', { 
    username, 
    password, 
    name,
    q1, a1, q2, a2, q3, a3
  });
  return data;
}

export async function getUserQuestions(username) {
  const { data } = await API.get(`/auth/user-questions/${username}`);
  return data;
}

export async function verifySecurity(username, a1, a2, a3) {
  const { data } = await API.post('/auth/verify-security', { username, a1, a2, a3 });
  return data;
}

export async function resetForgottenPassword(username, newPassword) {
  const { data } = await API.post('/auth/reset-forgotten-password', { username, new_password: newPassword });
  return data;
}
