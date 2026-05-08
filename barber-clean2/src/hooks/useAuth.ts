import { useState, useEffect } from "react";
import { loginUser } from "../services/api";
import {
  saveToken,
  removeToken,
  getToken,
  saveUserProfile,
  removeUserProfile,
  getUserProfile,
} from "../services/authStorage";

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    const token = await getToken();
    if (token) {
      const storedUser = await getUserProfile();
      setUser(storedUser ?? { logged: true });
    }
    setLoading(false);
  }

  async function login(email: string, password: string) {
    const response = await loginUser({ email, password });
    await saveToken(response.token);
    await saveUserProfile(response.user);
    setUser(response.user);
  }

  async function logout() {
    await removeToken();
    await removeUserProfile();
    setUser(null);
  }

  return {
    user,
    loading,
    login,
    logout,
  };
}
