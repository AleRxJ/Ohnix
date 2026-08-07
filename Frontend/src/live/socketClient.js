import { io } from "socket.io-client";
import { backendRootUrl } from "../api/api";

// Single shared connection for the whole app - TeamContext opens it once the
// user is authenticated and closes it on logout. Components use
// useResourcePresence (hooks/useResourcePresence.js) rather than talking to
// this module directly.
let socket = null;

export const connectSocket = (accessToken) => {
    if (socket?.connected && socket.auth?.token === accessToken) return socket;
    if (socket) socket.disconnect();

    socket = io(backendRootUrl, {
        path: "/api/v1/socket.io",
        withCredentials: true,
        auth: { token: accessToken },
        transports: ["websocket", "polling"],
    });

    return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};
