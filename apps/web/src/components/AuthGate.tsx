import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";

import { queryClient } from "../app/queryClient";
import { apiGet, apiPost } from "../lib/api";

type AuthState = {
  username: string;
  authenticated: boolean;
  mustChangePassword: boolean;
};

type ChangePasswordResult = {
  changed: boolean;
  authenticated: boolean;
  mustChangePassword: boolean;
};

export function AuthGate({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["auth", "me"],
    retry: false,
    queryFn: () => apiGet<AuthState>("/api/auth/me")
  });
  const loginMutation = useMutation({
    mutationFn: () => apiPost<AuthState>("/api/auth/login", { username, password }),
    onSuccess: async (result) => {
      setMessage(result.mustChangePassword ? "首次使用请修改初始密码。" : "");
      setCurrentPassword(password);
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "登录失败");
    }
  });
  const changePasswordMutation = useMutation({
    mutationFn: () => apiPost<ChangePasswordResult>("/api/auth/change-password", { currentPassword, newPassword }),
    onSuccess: async () => {
      setMessage("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "修改密码失败");
    }
  });

  function submitLogin() {
    if (!username.trim()) {
      setMessage("请输入用户名");
      return;
    }
    if (!password) {
      setMessage("请输入密码");
      return;
    }
    setMessage("");
    loginMutation.mutate();
  }

  function submitPasswordChange() {
    if (!currentPassword) {
      setMessage("请输入当前密码");
      return;
    }
    if (newPassword.length < 8) {
      setMessage("新密码至少需要 8 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("两次输入的新密码不一致");
      return;
    }
    if (currentPassword === newPassword) {
      setMessage("新密码不能和当前密码相同");
      return;
    }
    setMessage("");
    changePasswordMutation.mutate();
  }

  if (isLoading) {
    return (
      <main className="login-page">
        <p className="empty-state">正在检查登录状态...</p>
      </main>
    );
  }

  if (isError || !data?.authenticated) {
    return (
      <main className="login-page">
        <section className="login-panel">
          <LockKeyhole aria-hidden="true" />
          <h1>个人账本</h1>
          <label>
            <span>用户名</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setMessage("");
              }}
            />
          </label>
          <label>
            <span>密码</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setMessage("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitLogin();
              }}
            />
          </label>
          {message ? <div className="form-error">{message}</div> : null}
          <button className="primary-action full-width-action" type="button" onClick={submitLogin}>
            {loginMutation.isPending ? "登录中..." : "登录"}
          </button>
        </section>
      </main>
    );
  }

  if (data.mustChangePassword) {
    return (
      <main className="login-page">
        <section className="login-panel">
          <LockKeyhole aria-hidden="true" />
          <h1>修改初始密码</h1>
          <label>
            <span>当前密码</span>
            <input
              autoComplete="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setMessage("");
              }}
            />
          </label>
          <label>
            <span>新密码</span>
            <input
              autoComplete="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setMessage("");
              }}
            />
          </label>
          <label>
            <span>确认新密码</span>
            <input
              autoComplete="new-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setMessage("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitPasswordChange();
              }}
            />
          </label>
          {message ? <div className="form-error">{message}</div> : null}
          <button className="primary-action full-width-action" type="button" onClick={submitPasswordChange}>
            {changePasswordMutation.isPending ? "保存中..." : "保存新密码"}
          </button>
        </section>
      </main>
    );
  }

  return children;
}
