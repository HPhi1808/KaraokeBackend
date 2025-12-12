const token = localStorage.getItem('access_token');

if (!token) {
  alert('Chưa đăng nhập!');
  window.location.href = '/';
}

// Hàm gọi API có token
async function api(url, options = {}) {
  const token = localStorage.getItem('access_token');

  if (!token) {
    alert('Chưa đăng nhập!');
    window.location.href = '/';
    return null;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  if (response.status === 401 || response.status === 403) {
    alert('Token hết hạn hoặc không có quyền');
    logout();
    return null;
  }

  const data = await response.json();
  return data;
}

// Logout
function logout() {
  fetch('/api/auth/logout', {
    method: 'POST', body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }) });
  localStorage.clear();
  window.location.href = '/';
}

// Tên admin
document.getElementById('adminName').textContent = localStorage.getItem('admin_name') || 'Admin';

// Load trang con
async function loadPage(page) {
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div class="text-center py-5"><div class="spinner-border"></div> Đang tải...</div>';

  try {
    const res = await fetch(`/admin/${page}`);
    const html = await res.text();
    content.innerHTML = html;

    // Active menu
    document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`[onclick="loadPage('${page}')"]`)?.classList.add('active');

    // Gọi init nếu có
    if (window.initUsers) initUsers();
  } catch (err) {
    content.innerHTML = '<div class="alert alert-danger">Lỗi tải trang</div>';
  }
}

loadPage('users.html');