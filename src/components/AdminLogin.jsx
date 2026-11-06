import React, { useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';

export default function AdminLogin({ onAuthenticated }) {
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!password || isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'เข้าสู่ระบบไม่สำเร็จ');
      setPassword('');
      onAuthenticated?.();
    } catch (err) {
      setError(err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="adminLoginPage">
      <form className="adminLoginCard" onSubmit={handleSubmit}>
        <div className="adminLoginBrand"><ShieldCheck size={16} /> WHITE ANGEL · ADMIN</div>
        <h1>เข้าสู่ระบบแอดมิน</h1>
        <p>พื้นที่จัดการคลังฮีโร่และสกิน สำหรับผู้ดูแลระบบเท่านั้น</p>
        <label htmlFor="admin-password">รหัสผ่านแอดมิน</label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="กรอกรหัสผ่าน"
          required
          autoFocus
        />
        {error && <div className="adminLoginError" role="alert">{error}</div>}
        <button type="submit" disabled={isSubmitting || !password}>
          <LockKeyhole size={15} /> {isSubmitting ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </main>
  );
}
