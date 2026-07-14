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
    loadRecords();
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
        const editModal = document.getElementById('editModal');
        const deleteModal = document.getElementById('deleteModal');
        const deleteAllModal = document.getElementById('deleteAllModal');
        if (event.target === editModal) closeEditModal();
        if (event.target === deleteModal) closeDeleteModal();
        if (event.target === deleteAllModal) closeDeleteAllModal();
    });
}

// ========================================
// LOAD RECORDS
// ========================================
async function loadRecords() {
    try {
        const url = `/api/withdraw?page=${currentPage}&limit=${currentLimit}&search=${encodeURIComponent(currentSearch)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Failed to fetch records');
        }
        
        const data = await response.json();
        totalRecords = data.total;
        totalPages = data.totalPages;
        
        renderTable(data.records, data.page, data.total);
        renderPagination(data.page, data.totalPages);
        updateStats(data.records);
        updateRecordCount(data.total);
        
    } catch (error) {
        console.error('Error loading records:', error);
        showToast('Error loading records: ' + error.message, 'error');
    }
}

// ========================================
// RENDER TABLE
// ========================================
function renderTable(records, page, total) {
    const tbody = document.getElementById('tableBody');
    
    if (!records || records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px;">
                    <i class="fas fa-inbox" style="font-size: 40px; color: #ccc; display: block; margin-bottom: 10px;"></i>
                    <span style="color: #999;">No withdraw records found</span>
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    const startIndex = (page - 1) * currentLimit;
    
    records.forEach((record, index) => {
        const rowNumber = startIndex + index + 1;
        const amountClass = record.amount >= 1000 ? 'amount-high' : 
                           record.amount >= 500 ? 'amount-medium' : 'amount-low';
        
        // Status badge color
        let statusClass = 'status-pending';
        if (record.status === '审核通过' || record.status === '已完成') {
            statusClass = 'status-approved';
        } else if (record.status === '审核拒绝') {
            statusClass = 'status-rejected';
        }
        
        const requestTime = formatDate(record.request_time);
        
        html += `
            <tr>
                <td>${rowNumber}</td>
                <td><code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${escapeHtml(record.user_id)}</code></td>
                <td><strong>${escapeHtml(record.username)}</strong></td>
                <td class="${amountClass}">$${record.amount.toFixed(2)}</td>
                <td>${escapeHtml(record.bank_name || '-')}</td>
                <td style="font-size: 12px;">${escapeHtml(record.bank_account || '-')}</td>
                <td><span class="badge ${statusClass}">${escapeHtml(record.status)}</span></td>
                <td>${requestTime}</td>
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
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages || 1}`;
    
    document.getElementById('prevBtn').disabled = currentPage <= 1;
    document.getElementById('nextBtn').disabled = currentPage >= totalPages;
}

// ========================================
// UPDATE STATS
// ========================================
function updateStats(records) {
    document.getElementById('totalRecords').textContent = totalRecords;
    
    let totalAmount = 0;
    let approvedCount = 0;
    let pendingCount = 0;
    
    if (records) {
        records.forEach(record => {
            totalAmount += record.amount || 0;
            if (record.status === '审核通过' || record.status === '已完成') {
                approvedCount++;
            } else if (record.status === '待审核') {
                pendingCount++;
            }
        });
    }
    
    document.getElementById('totalAmount').textContent = `$${totalAmount.toFixed(2)}`;
    document.getElementById('approvedCount').textContent = approvedCount;
    document.getElementById('pendingCount').textContent = pendingCount;
}

// ========================================
// UPDATE RECORD COUNT
// ========================================
function updateRecordCount(total) {
    document.getElementById('recordCount').textContent = `Showing: ${total} records`;
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
    } else if (direction === 'next' && currentPage < totalPages) {
        currentPage++;
    }
    loadRecords();
}

function changePageSize() {
    currentLimit = parseInt(document.getElementById('pageSize').value);
    currentPage = 1;
    loadRecords();
}

// ========================================
// EDIT MODAL
// ========================================
async function openEditModal(id) {
    try {
        const response = await fetch(`/api/withdraw/${id}`);
        if (!response.ok) throw new Error('Failed to fetch record');
        
        const record = await response.json();
        
        document.getElementById('editId').value = record._id;
        document.getElementById('editUsername').value = record.username;
        document.getElementById('editUserId').value = record.user_id;
        document.getElementById('editAmount').value = record.amount;
        document.getElementById('editStatus').value = record.status;
        document.getElementById('editBank').value = record.bank_name || '';
        document.getElementById('editAccount').value = record.bank_account || '';
        
        document.getElementById('editModal').style.display = 'block';
        
    } catch (error) {
        console.error('Error opening edit modal:', error);
        showToast('Error loading record details', 'error');
    }
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

async function updateRecord(event) {
    event.preventDefault();
    
    const id = document.getElementById('editId').value;
    const data = {
        username: document.getElementById('editUsername').value.trim(),
        user_id: document.getElementById('editUserId').value.trim(),
        amount: parseFloat(document.getElementById('editAmount').value) || 0,
        status: document.getElementById('editStatus').value,
        bank_name: document.getElementById('editBank').value.trim(),
        bank_account: document.getElementById('editAccount').value.trim()
    };
    
    try {
        const response = await fetch(`/api/withdraw/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update record');
        }
        
        closeEditModal();
        showToast('Record updated successfully!', 'success');
        loadRecords();
        
    } catch (error) {
        console.error('Error updating record:', error);
        showToast('Error updating record: ' + error.message, 'error');
    }
}

// ========================================
// DELETE MODAL
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
        const response = await fetch(`/api/withdraw/${id}`, {
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
// DELETE ALL
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
}

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
        const response = await fetch('/api/withdraw/delete-all', {
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
// EXPORT
// ========================================
function exportRecords() {
    const search = document.getElementById('searchInput').value.trim();
    const url = `/api/withdraw/export?search=${encodeURIComponent(search)}`;
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
    const date = new Date(dateString);
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
        closeEditModal();
        closeDeleteModal();
        closeDeleteAllModal();
    }
    
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }
});
