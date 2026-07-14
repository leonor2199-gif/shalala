// ========================================
// STATE MANAGEMENT
// ========================================
let currentPage = 1;
let currentLimit = 20;
let currentSearch = '';
let totalRecords = 0;
let totalPages = 0;

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Dashboard initialized');
    loadRecords();
    loadStorageStats();
    setupEventListeners();
    
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchRecords();
        }
    });
});

// ========================================
// SETUP EVENT LISTENERS
// ========================================
function setupEventListeners() {
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('recordModal');
        const deleteModal = document.getElementById('deleteModal');
        const deleteAllModal = document.getElementById('deleteAllModal');
        if (event.target === modal) closeModal();
        if (event.target === deleteModal) closeDeleteModal();
        if (event.target === deleteAllModal) closeDeleteAllModal();
    });
}

// ========================================
// LOAD RECORDS
// ========================================
async function loadRecords() {
    try {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="loading-row">
                    <i class="fas fa-spinner fa-spin"></i>
                    Loading records...
                </td>
            </tr>
        `;
        
        const url = `/api/records?page=${currentPage}&limit=${currentLimit}&search=${encodeURIComponent(currentSearch)}`;
        console.log('📊 Fetching records from:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Records received:', data.total, 'records');
        console.log('📋 Sample record:', data.records && data.records.length > 0 ? data.records[0] : 'No records');
        
        totalRecords = data.total || 0;
        totalPages = data.totalPages || 0;
        
        if (data.records && data.records.length > 0) {
            renderTable(data.records, data.page, data.total);
        } else {
            renderEmptyTable();
        }
        
        renderPagination(data.page, data.totalPages);
        updateStats(data.records || []);
        updateRecordCount(data.total || 0);
        loadStorageStats();
        
    } catch (error) {
        console.error('❌ Error loading records:', error);
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #ef4444;">
                    <i class="fas fa-exclamation-circle" style="font-size: 40px; display: block; margin-bottom: 10px;"></i>
                    <span><strong>Error loading records</strong></span>
                    <br>
                    <span style="font-size: 14px; color: #666;">${error.message}</span>
                    <br>
                    <button onclick="loadRecords()" class="btn btn-primary" style="margin-top: 15px;">
                        <i class="fas fa-sync"></i> Retry
                    </button>
                </td>
            </tr>
        `;
        showToast('Error loading records: ' + error.message, 'error');
    }
}

// ========================================
// RENDER EMPTY TABLE
// ========================================
function renderEmptyTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="8" style="text-align: center; padding: 40px; color: #999;">
                <i class="fas fa-inbox" style="font-size: 40px; display: block; margin-bottom: 10px; color: #ccc;"></i>
                <span>No records found</span>
                <br>
                <span style="font-size: 14px;">Upload Excel files via Telegram bot or click "Add New"</span>
            </td>
        </tr>
    `;
}

// ========================================
// RENDER TABLE
// ========================================
function renderTable(records, page, total) {
    const tbody = document.getElementById('tableBody');
    
    if (!records || records.length === 0) {
        renderEmptyTable();
        return;
    }
    
    let html = '';
    const startIndex = (page - 1) * currentLimit;
    
    records.forEach((record, index) => {
        const rowNumber = startIndex + index + 1;
        const amountClass = record.amount >= 1000 ? 'amount-high' : 
                           record.amount >= 500 ? 'amount-medium' : 'amount-low';
        
        const requestTime = record.request_time ? formatDate(record.request_time) : '-';
        const processTime = record.process_time ? formatDate(record.process_time) : '-';
        
        html += `
            <tr>
                <td>${rowNumber}</td>
                <td><strong>${escapeHtml(record.username || '-')}</strong></td>
                <td><code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${escapeHtml(record.user_id || '-')}</code></td>
                <td class="${amountClass}">$${record.amount ? record.amount.toFixed(2) : '0.00'}</td>
                <td>${escapeHtml(record.fee || '0.00(0%)')}</td>
                <td>${requestTime}</td>
                <td>${processTime}</td>
                <td>
                    <div class="action-buttons">
                        <button onclick="openEditModal('${record._id}')" class="btn btn-primary btn-xs">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="openDeleteModal('${record._id}')" class="btn btn-danger btn-xs">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// ========================================
// RENDER PAGINATION
// ========================================
function renderPagination(currentPage, totalPages) {
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (pageInfo) {
        pageInfo.textContent = `Page ${currentPage || 1} of ${totalPages || 1}`;
    }
    
    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
    }
}

// ========================================
// UPDATE STATS
// ========================================
function updateStats(records) {
    const totalRecordsEl = document.getElementById('totalRecords');
    const totalAmountEl = document.getElementById('totalAmount');
    const uniqueUsersEl = document.getElementById('uniqueUsers');
    const todayRecordsEl = document.getElementById('todayRecords');
    
    if (totalRecordsEl) totalRecordsEl.textContent = totalRecords;
    
    let totalAmount = 0;
    let uniqueUsers = new Set();
    let todayCount = 0;
    const today = new Date().toDateString();
    
    if (records) {
        records.forEach(record => {
            totalAmount += record.amount || 0;
            if (record.user_id) uniqueUsers.add(record.user_id);
            
            if (record.request_time) {
                const recordDate = new Date(record.request_time).toDateString();
                if (recordDate === today) todayCount++;
            }
        });
    }
    
    if (totalAmountEl) totalAmountEl.textContent = `$${totalAmount.toFixed(2)}`;
    if (uniqueUsersEl) uniqueUsersEl.textContent = uniqueUsers.size;
    if (todayRecordsEl) todayRecordsEl.textContent = todayCount;
}

// ========================================
// UPDATE RECORD COUNT
// ========================================
function updateRecordCount(total) {
    const recordCount = document.getElementById('recordCount');
    if (recordCount) {
        recordCount.textContent = `Showing: ${total} records`;
    }
}

// ========================================
// LOAD STORAGE STATS
// ========================================
async function loadStorageStats() {
    try {
        const response = await fetch('/api/storage-stats');
        if (!response.ok) {
            throw new Error('Failed to fetch storage stats');
        }
        
        const stats = await response.json();
        
        const storageDisplay = document.getElementById('storageUsage');
        const recordCountStorage = document.getElementById('recordCountStorage');
        const avgRecordSize = document.getElementById('avgRecordSize');
        
        if (storageDisplay) {
            const totalMB = parseFloat(stats.totalSizeMB) || 0;
            if (totalMB > 1024) {
                storageDisplay.textContent = (totalMB / 1024).toFixed(2) + ' GB';
            } else {
                storageDisplay.textContent = totalMB.toFixed(2) + ' MB';
            }
            
            const storagePercent = (totalMB / 512) * 100;
            if (storagePercent > 80) {
                storageDisplay.style.color = '#ef4444';
            } else if (storagePercent > 60) {
                storageDisplay.style.color = '#f59e0b';
            } else {
                storageDisplay.style.color = '#22c55e';
            }
        }
        
        if (recordCountStorage) {
            recordCountStorage.textContent = `${stats.count || 0} records`;
        }
        
        if (avgRecordSize) {
            avgRecordSize.textContent = `${stats.avgObjSizeKB || 0} KB/record`;
        }
        
    } catch (error) {
        console.error('Error loading storage stats:', error);
    }
}

// ========================================
// SEARCH
// ========================================
function searchRecords() {
    currentSearch = document.getElementById('searchInput').value.trim();
    currentPage = 1;
    loadRecords();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    currentSearch = '';
    currentPage = 1;
    loadRecords();
}

// ========================================
// PAGINATION
// ========================================
function changePage(direction) {
    if (direction === 'prev' && currentPage > 1) {
        currentPage--;
        loadRecords();
    } else if (direction === 'next' && currentPage < totalPages) {
        currentPage++;
        loadRecords();
    }
}

function changePageSize() {
    currentLimit = parseInt(document.getElementById('pageSize').value);
    currentPage = 1;
    loadRecords();
}

// ========================================
// MODAL FUNCTIONS - ADD
// ========================================
function openAddModal() {
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Add New Record';
    document.getElementById('submitBtnText').textContent = 'Save';
    document.getElementById('recordId').value = '';
    document.getElementById('recordForm').reset();
    document.getElementById('recordForm').onsubmit = saveRecord;
    
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
    document.getElementById('formRequestTime').value = localDateTime;
    document.getElementById('formProcessTime').value = localDateTime;
    
    document.getElementById('recordModal').style.display = 'block';
}

// ========================================
// MODAL FUNCTIONS - EDIT
// ========================================
async function openEditModal(id) {
    try {
        const response = await fetch(`/api/records/${id}`);
        if (!response.ok) throw new Error('Failed to fetch record');
        
        const record = await response.json();
        
        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Record';
        document.getElementById('submitBtnText').textContent = 'Update';
        document.getElementById('recordId').value = record._id;
        document.getElementById('formUsername').value = record.username || '';
        document.getElementById('formUserId').value = record.user_id || '';
        document.getElementById('formAmount').value = record.amount || 0;
        document.getElementById('formFee').value = record.fee || '0.00(0%)';
        
        if (record.request_time) {
            const requestTime = new Date(record.request_time);
            document.getElementById('formRequestTime').value = formatDateTimeLocal(requestTime);
        }
        if (record.process_time) {
            const processTime = new Date(record.process_time);
            document.getElementById('formProcessTime').value = formatDateTimeLocal(processTime);
        }
        
        document.getElementById('recordForm').onsubmit = updateRecord;
        document.getElementById('recordModal').style.display = 'block';
        
    } catch (error) {
        console.error('Error opening edit modal:', error);
        showToast('Error loading record details', 'error');
    }
}

// ========================================
// MODAL FUNCTIONS - DELETE
// ========================================
function openDeleteModal(id) {
    document.getElementById('deleteId').value = id;
    document.getElementById('deleteModal').style.display = 'block';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
}

async function confirmDelete() {
    const id = document.getElementById('deleteId').value;
    
    try {
        const response = await fetch(`/api/records/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete record');
        }
        
        closeDeleteModal();
        showToast('Record deleted successfully!', 'success');
        loadRecords();
        
    } catch (error) {
        console.error('Error deleting record:', error);
        showToast('Error deleting record: ' + error.message, 'error');
    }
}

// ========================================
// MODAL FUNCTIONS - DELETE ALL
// ========================================
let deleteAllTotal = 0;

function openDeleteAllModal() {
    deleteAllTotal = parseInt(document.getElementById('totalRecords').textContent) || 0;
    
    if (deleteAllTotal === 0) {
        showToast('No records to delete!', 'info');
        return;
    }
    
    document.getElementById('deleteAllTotal').textContent = deleteAllTotal;
    document.getElementById('deleteAllConfirm').checked = false;
    document.getElementById('deleteAllBtn').disabled = true;
    document.getElementById('deleteAllModal').style.display = 'block';
}

function closeDeleteAllModal() {
    document.getElementById('deleteAllModal').style.display = 'none';
    document.getElementById('deleteAllConfirm').checked = false;
    document.getElementById('deleteAllBtn').disabled = true;
}

// Enable/disable delete all button based on checkbox
document.addEventListener('DOMContentLoaded', function() {
    const confirmCheckbox = document.getElementById('deleteAllConfirm');
    if (confirmCheckbox) {
        confirmCheckbox.addEventListener('change', function() {
            document.getElementById('deleteAllBtn').disabled = !this.checked;
        });
    }
});

async function confirmDeleteAll() {
    const confirmCheckbox = document.getElementById('deleteAllConfirm');
    if (!confirmCheckbox.checked) {
        showToast('Please confirm you understand the action', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/records/delete-all', {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete all records');
        }
        
        const result = await response.json();
        closeDeleteAllModal();
        showToast(`✅ ${result.message} (${result.deletedCount} records deleted)`, 'success');
        loadRecords();
        
    } catch (error) {
        console.error('Error deleting all records:', error);
        showToast('Error deleting records: ' + error.message, 'error');
    }
}

// ========================================
// CLOSE MODAL
// ========================================
function closeModal() {
    document.getElementById('recordModal').style.display = 'none';
    document.getElementById('recordForm').reset();
}

// ========================================
// SAVE RECORD (ADD)
// ========================================
async function saveRecord(event) {
    event.preventDefault();
    
    const data = getFormData();
    
    try {
        const response = await fetch('/api/records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save record');
        }
        
        closeModal();
        showToast('Record added successfully!', 'success');
        loadRecords();
        
    } catch (error) {
        console.error('Error saving record:', error);
        showToast('Error saving record: ' + error.message, 'error');
    }
}

// ========================================
// UPDATE RECORD (EDIT)
// ========================================
async function updateRecord(event) {
    event.preventDefault();
    
    const id = document.getElementById('recordId').value;
    const data = getFormData();
    
    try {
        const response = await fetch(`/api/records/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update record');
        }
        
        closeModal();
        showToast('Record updated successfully!', 'success');
        loadRecords();
        
    } catch (error) {
        console.error('Error updating record:', error);
        showToast('Error updating record: ' + error.message, 'error');
    }
}

// ========================================
// GET FORM DATA
// ========================================
function getFormData() {
    return {
        username: document.getElementById('formUsername').value.trim(),
        user_id: document.getElementById('formUserId').value.trim(),
        amount: parseFloat(document.getElementById('formAmount').value) || 0,
        fee: document.getElementById('formFee').value.trim(),
        request_time: document.getElementById('formRequestTime').value,
        process_time: document.getElementById('formProcessTime').value
    };
}

// ========================================
// EXPORT RECORDS
// ========================================
function exportRecords() {
    const search = document.getElementById('searchInput').value.trim();
    const url = `/api/records/export?search=${encodeURIComponent(search)}`;
    window.open(url, '_blank');
    showToast('Exporting records...', 'info');
}

// ========================================
// TOAST NOTIFICATION
// ========================================
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const icon = toast.querySelector('.toast-icon');
    
    toast.className = 'toast';
    toast.classList.add(type);
    
    if (type === 'success') {
        icon.className = 'fas fa-check-circle toast-icon';
    } else if (type === 'error') {
        icon.className = 'fas fa-exclamation-circle toast-icon';
    } else if (type === 'info') {
        icon.className = 'fas fa-info-circle toast-icon';
    }
    
    toastMessage.textContent = message;
    toast.classList.add('show');
    
    clearTimeout(toast.timeout);
    toast.timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ========================================
// UTILITY FUNCTIONS
// ========================================
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

function formatDateTimeLocal(date) {
    if (!date || isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// KEYBOARD SHORTCUTS
// ========================================
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
        closeDeleteModal();
        closeDeleteAllModal();
    }
    
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }
});

console.log('✅ Dashboard JavaScript loaded successfully');
