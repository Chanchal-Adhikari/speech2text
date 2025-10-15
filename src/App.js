import React, { useState, useRef, useEffect } from "react";

export default function AudioTypingTest() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const [referenceTranscript, setReferenceTranscript] = useState("");
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [testRunning, setTestRunning] = useState(false);
  const [userText, setUserText] = useState("");
  const [result, setResult] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setRecognitionSupported(true);
      const rec = new SpeechRecognition();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      recognitionRef.current = rec;
    } else {
      setRecognitionSupported(false);
      recognitionRef.current = null;
    }
  }, []);

  async function startRecording() {
    setResult(null);
    setReferenceTranscript("");
    setAudioURL(null);
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioURL(url);
      };

      mr.start();
      setIsRecording(true);

      if (recognitionRef.current) {
        const rec = recognitionRef.current;
        let final = "";
        rec.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const r = event.results[i];
            if (r.isFinal) final += r[0].transcript + " ";
          }
          setReferenceTranscript(final.trim());
        };
        rec.onerror = (e) => console.warn("SpeechRecognition error", e);
        try {
          rec.start();
        } catch (e) {}
      }
    } catch (err) {
      console.error("Mic permission error", err);
      alert("Microphone access required.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsRecording(false);
  }

  function startTest() {
    if (!audioURL && !recordedBlob) {
      alert("Please record audio first.");
      return;
    }
    setUserText("");
    setResult(null);
    setRemaining(timeLimitSeconds);
    setTestRunning(true);

    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timerRef.current);
          finishTest();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }

  function finishTest() {
    if (timerRef.current) clearInterval(timerRef.current);
    setTestRunning(false);
    const ref = normalizeText(referenceTranscript || "");
    const hyp = normalizeText(userText || "");
    const werOutput = computeWER(ref, hyp);
    setResult(werOutput);
  }

  function normalizeText(s) {
    return s.replace(/[^\w\s']/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function computeWER(refText, hypText) {
    const r = refText.length === 0 ? [] : refText.split(" ");
    const h = hypText.length === 0 ? [] : hypText.split(" ");
    const N = r.length;
    const dp = Array(r.length + 1).fill(null).map(() => Array(h.length + 1).fill(0));
    for (let i = 0; i <= r.length; i++) dp[i][0] = i;
    for (let j = 0; j <= h.length; j++) dp[0][j] = j;
    for (let i = 1; i <= r.length; i++) {
      for (let j = 1; j <= h.length; j++) {
        if (r[i - 1] === h[j - 1]) dp[i][j] = dp[i - 1][j - 1];
        else dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1);
      }
    }
    const edits = dp[r.length][h.length];
    const wer = N === 0 ? (h.length === 0 ? 0 : 1) : edits / N;
    return { edits, N, wer };
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Audio Typing Test</h1>
      <button
        className={`px-4 py-2 rounded mr-2 ${isRecording ? 'bg-red-500' : 'bg-blue-600'} text-white`}
        onClick={() => (isRecording ? stopRecording() : startRecording())}
      >
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
      <button className="px-4 py-2 bg-yellow-500 rounded" onClick={() => {setReferenceTranscript("");setAudioURL(null);}}>Clear</button>
      {audioURL && <div className="mt-3"><audio ref={audioRef} controls src={audioURL}></audio></div>}
      <div className="mt-4">
        <label>Time limit (seconds): </label>
        <input type="number" value={timeLimitSeconds} onChange={(e) => setTimeLimitSeconds(Number(e.target.value))} />
        <button className="ml-3 px-3 py-1 bg-indigo-600 text-white rounded" onClick={startTest}>Start Typing Test</button>
      </div>
      {testRunning && (
        <div className="mt-4">
          <p>Time remaining: {remaining}s</p>
          <textarea className="w-full border p-2" rows="6" value={userText} onChange={(e) => setUserText(e.target.value)} placeholder="Type here..." />
          <button className="mt-2 px-3 py-1 bg-red-500 text-white rounded" onClick={finishTest}>Finish</button>
        </div>
      )}
      {result && (
        <div className="mt-4 p-3 bg-gray-100 rounded">
          <p><strong>Words in reference:</strong> {result.N}</p>
          <p><strong>Edits:</strong> {result.edits}</p>
          <p><strong>WER:</strong> {(result.wer * 100).toFixed(2)}%</p>
        </div>
      )}
    </div>
  );
}
