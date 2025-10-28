import React, { useState, useRef } from "react";
import kurentoUtils from "kurento-utils";
import "./CallHandler.css";

/**
 * GroupCall Component
 * Reimplementation of Kurento's group call demo in React (JSX)
 */
const CallHandler = () => {
    const [name, setName] = useState("");
    const [room, setRoom] = useState("");
    const [joined, setJoined] = useState(false);
    const participantsRef = useRef({});
    const wsRef = useRef(null);
    const participantsContainer = useRef(null);

    /** ---- Helper: Send Message via WS ---- */
    const sendMessage = (message) => {
        const jsonMessage = JSON.stringify(message);
        console.log("Sending message:", jsonMessage);
        wsRef.current?.send(jsonMessage);
    };

    /** ---- Join Room ---- */
    const joinRoom = () => {
        if (!name || !room) return alert("Please enter name and room");

        const ws = new WebSocket("ws://localhost:8080/rtc");

        wsRef.current = ws;

        ws.onopen = () => {
            console.log("WebSocket connected");
            const message = { id: "joinRoom", name, room };
            sendMessage(message);
            setJoined(true);
        };

        ws.onmessage = (msg) => {
            const parsed = JSON.parse(msg.data);
            console.log("Received:", parsed);

            switch (parsed.id) {
                case "existingParticipants":
                    onExistingParticipants(parsed);
                    break;
                case "newParticipantArrived":
                    onNewParticipant(parsed);
                    break;
                case "participantLeft":
                    onParticipantLeft(parsed);
                    break;
                case "receiveVideoAnswer":
                    receiveVideoResponse(parsed);
                    break;
                case "iceCandidate":
                    const p = participantsRef.current[parsed.name];

                    if (p && p.rtcPeer) {
                        p.rtcPeer.addIceCandidate(parsed.candidate, (err) => {
                            if (err) console.error("Error adding candidate:", err);
                        });
                    }
                    break;
                default:
                    console.error("Unrecognized message", parsed);
            }
        };

        ws.onclose = () => console.log("WebSocket closed");
    };

    /** ---- Handle Existing Participants ---- */
    const onExistingParticipants = (msg) => {
        console.log(`${name} joined room ${room}`);

        const constraints = {
            audio: true,
            video: {
                mandatory: {
                    maxWidth: 320,
                    maxFrameRate: 15,
                    minFrameRate: 15,
                },
            },
        };

        // Create self participant
        const localVideo = document.createElement("video");
        localVideo.id = "video-" + name;
        localVideo.autoplay = true;
        localVideo.muted = true;
        localVideo.className = "participant-video";

        const container = document.createElement("div");
        container.className = "participant";
        container.appendChild(localVideo);
        const label = document.createElement("span");
        label.innerText = name;
        container.appendChild(label);
        participantsContainer.current.appendChild(container);

        const participant = { name, rtcPeer: null, video: localVideo };
        participantsRef.current[name] = participant;

        const options = {
            localVideo: localVideo,
            mediaConstraints: constraints,
            onicecandidate: (candidate) => {
                sendMessage({
                    id: "onIceCandidate",
                    candidate,
                    name,
                });
            },
        };

        participant.rtcPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(
            options,
            function (error) {
                if (error) return console.error(error);
                this.generateOffer((err, offerSdp) => {
                    if (err) return console.error(err);
                    const msg = {
                        id: "receiveVideoFrom",
                        sender: name,
                        sdpOffer: offerSdp,
                    };
                    sendMessage(msg);
                });
            }
        );

        msg.data.forEach(receiveVideo);
    };

    /** ---- Handle New Participant ---- */
    const onNewParticipant = (msg) => {
        receiveVideo(msg.name);
    };

    /** ---- Receive Video ---- */
    const receiveVideo = (sender) => {
        console.log("Receiving video from:", sender);

        const video = document.createElement("video");
        video.id = "video-" + sender;
        video.autoplay = true;
        video.className = "participant-video";

        const container = document.createElement("div");
        container.className = "participant";
        container.appendChild(video);
        const label = document.createElement("span");
        label.innerText = sender;
        container.appendChild(label);
        participantsContainer.current.appendChild(container);

        const participant = { name: sender, rtcPeer: null, video };
        participantsRef.current[sender] = participant;

        const options = {
            remoteVideo: video,
            onicecandidate: (candidate) => {
                sendMessage({
                    id: "onIceCandidate",
                    candidate,
                    name: sender,
                });
            },
        };

        participant.rtcPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(
            options,
            function (error) {
                if (error) return console.error(error);
                this.generateOffer((err, offerSdp) => {
                    if (err) return console.error(err);
                    const msg = {
                        id: "receiveVideoFrom",
                        sender,
                        sdpOffer: offerSdp,
                    };
                    sendMessage(msg);
                });
            }
        );
    };

    /** ---- Handle SDP Answer ---- */
    const receiveVideoResponse = (result) => {
        const participant = participantsRef.current[result.name];
        if (participant && participant.rtcPeer) {
            participant.rtcPeer.processAnswer(result.sdpAnswer, (error) => {
                if (error) console.error(error);
            });
        }
    };

    /** ---- Participant Left ---- */
    const onParticipantLeft = (msg) => {
        console.log("Participant left:", msg.name);
        const participant = participantsRef.current[msg.name];
        if (participant) {
            if (participant.rtcPeer) participant.rtcPeer.dispose();
            if (participant.video && participant.video.parentNode) {
                participant.video.parentNode.remove();
            }
            delete participantsRef.current[msg.name];
        }
    };

    /** ---- Leave Room ---- */
    const leaveRoom = () => {
        sendMessage({ id: "leaveRoom" });
        Object.values(participantsRef.current).forEach((p) => {
            if (p.rtcPeer) p.rtcPeer.dispose();
            if (p.video && p.video.parentNode) p.video.parentNode.remove();
        });
        participantsRef.current = {};
        wsRef.current?.close();
        setJoined(false);
    };

    return (
        <div className="group-call-container">
            {!joined ? (
                <div className="join-room">
                    <h2>Join a Room</h2>
                    <input
                        type="text"
                        placeholder="Username"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Room"
                        value={room}
                        onChange={(e) => setRoom(e.target.value)}
                    />
                    <button onClick={joinRoom}>Join</button>
                </div>
            ) : (
                <div className="room">
                    <h3>Room: {room}</h3>
                    <div ref={participantsContainer} className="participants-container" />
                    <button className="leave-btn" onClick={leaveRoom}>
                        Leave Room
                    </button>
                </div>
            )}
        </div>
    );
};

export default CallHandler;
