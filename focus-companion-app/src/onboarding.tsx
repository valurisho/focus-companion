import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./utils/supabase";

export type BuddyLook = "blob" | "cat" | "owl";

export interface UserProfile {
  id: string;
  username: string | null;
  buddy_name: string;
  buddy_look: BuddyLook;
  session_minutes: number;
}

type Page = "loading" | "welcome" | "buddy" | "auth" | "settings";
type AuthMode = "sign-up" | "sign-in";

const profileSelect = "id, username, buddy_name, buddy_look, session_minutes";
const allowedLooks: BuddyLook[] = ["blob", "cat", "owl"];

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return "Something went wrong. Please try again.";
}

function friendlyError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    return "That username is already taken. Please choose another.";
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23514"
  ) {
    return "Please use 3–20 letters, numbers, or underscores for your username.";
  }
  return messageFromError(error);
}

async function getOrCreateProfile(user: User): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as UserProfile;

  const metadata = user.user_metadata ?? {};
  const look = allowedLooks.includes(metadata.buddy_look)
    ? (metadata.buddy_look as BuddyLook)
    : "blob";
  const requestedName =
    typeof metadata.buddy_name === "string" ? metadata.buddy_name.trim() : "";
  const { data: created, error: createError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      buddy_name: requestedName.slice(0, 20) || "Tomo",
      buddy_look: look,
      session_minutes: 20,
    })
    .select(profileSelect)
    .single();

  if (createError) throw createError;
  return created as UserProfile;
}

const sessionHourOptions = [0, 1, 2, 3, 4];
const sessionMinuteOptions = Array.from({ length: 12 }, (_, i) => i * 5);
const wheelRowHeight = 48;

function WheelColumn({
  label,
  unit,
  values,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  values: number[];
  value: number;
  onChange: (value: number) => void;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const settleTimeout = useRef<number | null>(null);

  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return;
    wheel.scrollTop = values.indexOf(value) * wheelRowHeight;
  }, []);

  useEffect(
    () => () => {
      if (settleTimeout.current !== null)
        window.clearTimeout(settleTimeout.current);
    },
    [],
  );

  const selectValue = (index: number) => {
    const safeIndex = Math.max(0, Math.min(values.length - 1, index));
    onChange(values[safeIndex]);
    wheelRef.current?.scrollTo({
      top: safeIndex * wheelRowHeight,
      behavior: "smooth",
    });
  };

  const settleScroll = () => {
    if (settleTimeout.current !== null)
      window.clearTimeout(settleTimeout.current);
    settleTimeout.current = window.setTimeout(() => {
      const wheel = wheelRef.current;
      if (!wheel) return;
      const index = Math.max(
        0,
        Math.min(
          values.length - 1,
          Math.round(wheel.scrollTop / wheelRowHeight),
        ),
      );
      onChange(values[index]);
    }, 90);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    selectValue(
      values.indexOf(value) + (event.key === "ArrowDown" ? 1 : -1),
    );
  };

  return (
    <div
      className={`wheel-column ${unit === "hr" ? "hours-column" : "minutes-column"}`}
    >
      <div
        ref={wheelRef}
        className="wheel-viewport"
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onScroll={settleScroll}
        onKeyDown={handleKeyDown}
      >
        {values.map((option, index) => (
          <button
            className={`wheel-option ${option === value ? "selected" : ""}`}
            key={option}
            type="button"
            role="option"
            aria-selected={option === value}
            tabIndex={-1}
            onClick={() => selectValue(index)}
          >
            {String(option).padStart(2, "0")}
          </button>
        ))}
      </div>
      <span className="wheel-unit" aria-hidden="true">
        {unit}
      </span>
    </div>
  );
}

function formatDuration(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
  }
  return `${minutes} min`;
}

export function BuddyAvatar({
  look,
  className = "",
}: {
  look: BuddyLook;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 72 72" aria-hidden="true">
      {look === "cat" && (
        <path className="avatar-ears" d="M15 31 18 8l18 15L54 8l3 23" />
      )}
      {look === "owl" && (
        <path className="avatar-ears" d="M15 29q3-18 12-15m30 15q-3-18-12-15" />
      )}
      <path className="avatar-body" d="M13 62c2-24 9-38 23-38s21 14 23 38z" />
      {look === "owl" && (
        <>
          <circle className="avatar-eye-ring" cx="27" cy="43" r="9" />
          <circle className="avatar-eye-ring" cx="45" cy="43" r="9" />
          <path className="avatar-beak" d="m36 46 4 5h-8z" />
        </>
      )}
      {look !== "owl" && (
        <>
          <circle className="avatar-eye" cx="27" cy="43" r="2.3" />
          <circle className="avatar-eye" cx="45" cy="43" r="2.3" />
          <path className="avatar-smile" d="M31 51q5 5 10 0" />
        </>
      )}
    </svg>
  );
}

function StepMarker({ step }: { step: number }) {
  return (
    <div className="onboarding-progress" aria-label={`Step ${step} of 3`}>
      <span className={step >= 1 ? "active" : ""} />
      <span className={step >= 2 ? "active" : ""} />
      <span className={step >= 3 ? "active" : ""} />
      <span className="onboarding-step-label">Step {step} of 3</span>
    </div>
  );
}

export function OnboardingFlow({
  onComplete,
}: {
  onComplete: (profile: UserProfile, email: string) => void;
}) {
  const [page, setPage] = useState<Page>("loading");
  const [authMode, setAuthMode] = useState<AuthMode>("sign-up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [buddyName, setBuddyName] = useState("Tomo");
  const [buddyLook, setBuddyLook] = useState<BuddyLook>("blob");
  const [username, setUsername] = useState("");
  const [sessionMinutes, setSessionMinutes] = useState(20);
  const [draftSessionHours, setDraftSessionHours] = useState(0);
  const [draftSessionMins, setDraftSessionMins] = useState(20);
  const [userId, setUserId] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const acceptUser = useCallback(
    async (user: User, fromRestore = false) => {
      setUserId(user.id);
      setAccountEmail(user.email ?? "");
      const profile = await getOrCreateProfile(user);
      // Do NOT overwrite buddyLook or buddyName here — the user may have
      // explicitly chosen them on the buddy page. For the onComplete path,
      // finishOnboarding sets them from the profile. For the settings path,
      // saveProfile reads the current state values (the user's choices).
      setUsername(profile.username ?? "");
      setSessionMinutes(profile.session_minutes);
      setDraftSessionHours(Math.floor(profile.session_minutes / 60));
      setDraftSessionMins(profile.session_minutes % 60);
      if (profile.username) {
        onComplete(profile, user.email ?? "");
      } else if (fromRestore) {
        // Incomplete profile found on startup — either mid-setup state or a
        // stale session for a soft-deleted account. Sign out and go to welcome
        // so the user starts cleanly instead of landing mid-flow.
        await supabase.auth.signOut();
        setPage("welcome");
      } else {
        setPage("settings");
      }
    },
    [onComplete],
  );

  useEffect(() => {
    let mounted = true;
    // Use getUser() rather than getSession() so the session is validated
    // against the server. This rejects stale tokens for deleted/soft-deleted
    // accounts instead of silently treating them as valid.
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error || !data.user) {
        setPage("welcome");
        return;
      }
      try {
        await acceptUser(data.user, true);
      } catch (profileError) {
        if (!mounted) return;
        void supabase.auth.signOut();
        setErrorMessage('Could not load your profile. Please sign in again.');
        setPage('welcome');
      }
    });
    return () => {
      mounted = false;
    };
  }, [acceptUser]);

  const prepareSettings = async (user: User) => {
    await acceptUser(user);
    setStatusMessage("");
  };

  const submitAuthentication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    const normalizedEmail = email.trim().toLowerCase();

    if (authMode === "sign-up" && password !== confirmPassword) {
      setErrorMessage("Those passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Your password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (authMode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              buddy_name: buddyName.trim() || "Tomo",
              buddy_look: buddyLook,
            },
          },
        });
        if (error) throw error;
        setEmail(normalizedEmail);
        setPassword("");
        setConfirmPassword("");
        if (data.session && data.user) {
          await prepareSettings(data.user);
        } else {
          setAuthMode("sign-in");
          setStatusMessage(
            "Check your email to confirm your account, then come back here and log in.",
          );
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
        if (!data.user)
          throw new Error("Sign-in succeeded but no account was returned.");
        await prepareSettings(data.user);
      }
    } catch (error) {
      setErrorMessage(friendlyError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    const normalizedUsername = username.trim().toLowerCase();
    const trimmedBuddyName = buddyName.trim();

    if (!userId) {
      setErrorMessage("Please log in again to finish setting up your profile.");
      setPage("auth");
      setAuthMode("sign-in");
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
      setErrorMessage(
        "Username must be 3–20 characters: letters, numbers, or underscores.",
      );
      return;
    }
    if (sessionMinutes < 5) {
      setErrorMessage("Session length must be at least 5 minutes.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: normalizedUsername,
          buddy_name: trimmedBuddyName,
          buddy_look: buddyLook,
          session_minutes: sessionMinutes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (error) throw error;

      onComplete(
        {
          id: userId,
          username: normalizedUsername,
          buddy_name: trimmedBuddyName,
          buddy_look: buddyLook,
          session_minutes: sessionMinutes,
        },
        accountEmail,
      );
    } catch (error) {
      setErrorMessage(friendlyError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (page === "loading") {
    return (
      <main className="app-shell onboarding-shell">
        <section className="study-window onboarding-window">
          <div className="onboarding-loading">
            <span className="loading-mark">✦</span>
            <p>Getting your study space ready…</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell onboarding-shell ${page === "welcome" ? "welcome-shell" : ""}`}>
      <section
        className="study-window onboarding-window"
        aria-label="Tomo's Nook setup"
      >

        <div className="onboarding-content">
          {page === "welcome" && (
            <section className="onboarding-card welcome-card">
              <div className="welcome-buddy">
                <BuddyAvatar look={buddyLook} className="onboarding-avatar" />
              </div>
              <p className="eyebrow">A LITTLE COMPANION FOR YOUR FOCUS</p>
              <h1><span>Tomo's</span><span>Nook</span></h1>
              <p className="onboarding-copy">
                Stay focused, finish sessions, and help your buddy grow along
                the way.
              </p>
              {errorMessage && (
                <p className="form-message error" role="alert">
                  {errorMessage}
                </p>
              )}
              <button
                className="onboarding-primary"
                onClick={() => {
                  setErrorMessage("");
                  setPage("buddy");
                  setAuthMode("sign-up");
                }}
              >
                Get started
              </button>
              <p className="onboarding-switch">
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setErrorMessage("");
                    setStatusMessage("");
                    setAuthMode("sign-in");
                    setPage("auth");
                  }}
                >
                  Log in
                </button>
              </p>
            </section>
          )}

          {page === "buddy" && (
            <section className="onboarding-card">
              <StepMarker step={1} />
              <h1>Meet your study buddy</h1>
              <p className="onboarding-copy">
                Choose a look and give your companion a name.
              </p>

              <label className="onboarding-label">
                Choose a look <span>(optional)</span>
              </label>
              <div
                className="buddy-look-options"
                role="group"
                aria-label="Choose your buddy's look"
              >
                {allowedLooks.map((look) => (
                  <button
                    key={look}
                    type="button"
                    className={`buddy-look-option ${buddyLook === look ? "selected" : ""}`}
                    aria-pressed={buddyLook === look}
                    onClick={() => setBuddyLook(look)}
                  >
                    <BuddyAvatar look={look} className="look-avatar" />
                    <span>
                      {look[0].toUpperCase() + look.slice(1)}
                    </span>
                  </button>
                ))}
              </div>

              <label className="onboarding-label" htmlFor="buddy-name">
                Buddy name
              </label>
              <input
                id="buddy-name"
                className="onboarding-input"
                value={buddyName}
                onChange={(event) => setBuddyName(event.target.value)}
                maxLength={20}
                autoComplete="off"
              />
              <p className="field-hint">
                You can change this later in Settings.
              </p>
              {!buddyName.trim() ? (
                <p className="form-message error" role="alert">
                  Please enter a name for your buddy.
                </p>
              ) : (
                <div className="buddy-name-preview">
                  <span>How it shows on the timer</span>
                  <strong>{buddyName.trim()}</strong>
                </div>
              )}

              <div className="onboarding-actions">
                <button
                  className="onboarding-secondary"
                  onClick={() => setPage("welcome")}
                >
                  Back
                </button>
                <button
                  className="onboarding-primary compact"
                  disabled={!buddyName.trim()}
                  onClick={() => {
                    setErrorMessage("");
                    setPage("auth");
                  }}
                >
                  Continue
                </button>
              </div>
            </section>
          )}

          {page === "auth" && (
            <section className="onboarding-card auth-card">
              <StepMarker step={2} />
              <div className="auth-heading">
                <BuddyAvatar look={buddyLook} className="auth-avatar" />
                <div>
                  <p className="eyebrow">YOUR BUDDY IS WAITING</p>
                  <h1>
                    {authMode === "sign-up" ? "Create your account" : "Log in"}
                  </h1>
                </div>
              </div>
              <p className="onboarding-copy">
                {authMode === "sign-up"
                  ? "Save your buddy and settings across devices."
                  : "Welcome back. Your study space is ready."}
              </p>

              <form className="onboarding-form" onSubmit={submitAuthentication}>
                <label className="onboarding-label" htmlFor="account-email">
                  Email
                </label>
                <input
                  id="account-email"
                  className="onboarding-input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
                <label className="onboarding-label" htmlFor="account-password">
                  Password
                </label>
                <input
                  id="account-password"
                  className="onboarding-input"
                  type="password"
                  autoComplete={
                    authMode === "sign-up" ? "new-password" : "current-password"
                  }
                  minLength={6}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                />
                {authMode === "sign-up" && (
                  <>
                    <label
                      className="onboarding-label"
                      htmlFor="confirm-password"
                    >
                      Confirm password
                    </label>
                    <input
                      id="confirm-password"
                      className="onboarding-input"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="Enter your password again"
                    />
                  </>
                )}
                {errorMessage && (
                  <p className="form-message error" role="alert">
                    {errorMessage}
                  </p>
                )}
                {statusMessage && (
                  <p className="form-message success" role="status">
                    {statusMessage}
                  </p>
                )}
                <button
                  className="onboarding-primary full-width"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? "Please wait…"
                    : authMode === "sign-up"
                      ? "Create account & continue"
                      : "Log in & continue"}
                </button>
              </form>

              <p className="onboarding-switch">
                {authMode === "sign-up"
                  ? "Already have an account?"
                  : "New here?"}{" "}
                <button
                  onClick={() => {
                    setErrorMessage("");
                    setStatusMessage("");
                    setAuthMode(authMode === "sign-up" ? "sign-in" : "sign-up");
                  }}
                >
                  {authMode === "sign-up" ? "Log in" : "Create an account"}
                </button>
              </p>
              <div className="onboarding-actions">
                <button
                  className="onboarding-secondary"
                  onClick={() => {
                    setErrorMessage("");
                    setPage(authMode === "sign-up" ? "buddy" : "welcome");
                  }}
                >
                  Back
                </button>
              </div>
            </section>
          )}

          {page === "settings" && (
            <section className="onboarding-card settings-card">
              <StepMarker step={3} />
              <h1>Make it yours</h1>
              <p className="onboarding-copy">
                Your choices are saved to your account.
              </p>

              <form className="onboarding-form" onSubmit={saveProfile}>
                <div className="onboarding-settings-group">
                  <p className="settings-group-title">STUDY TIMER</p>
                  <label className="onboarding-label">Session length</label>
                  <div className="time-wheel">
                    <WheelColumn
                      label="Hours"
                      unit="hr"
                      values={sessionHourOptions}
                      value={draftSessionHours}
                      onChange={(h) => {
                        setDraftSessionHours(h);
                        setSessionMinutes(h * 60 + draftSessionMins);
                      }}
                    />
                    <WheelColumn
                      label="Minutes"
                      unit="min"
                      values={sessionMinuteOptions}
                      value={draftSessionMins}
                      onChange={(m) => {
                        setDraftSessionMins(m);
                        setSessionMinutes(draftSessionHours * 60 + m);
                      }}
                    />
                  </div>
                  {sessionMinutes < 5 && (
                    <p className="form-message error" role="alert">
                      Session must be at least 5 minutes.
                    </p>
                  )}
                </div>

                <div className="onboarding-settings-group">
                  <p className="settings-group-title">ACCOUNT &amp; BUDDY</p>
                  <p className="account-email-note">{accountEmail}</p>
                  <label
                    className="onboarding-label"
                    htmlFor="account-username"
                  >
                    Username
                  </label>
                  <input
                    id="account-username"
                    className="onboarding-input"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    minLength={3}
                    maxLength={20}
                    pattern="[A-Za-z0-9_]{3,20}"
                    required
                    autoComplete="username"
                    placeholder="e.g. adeline_studies"
                  />
                  <p className="field-hint">
                    Letters, numbers, and underscores; 3–20 characters.
                  </p>
                </div>

                {errorMessage && (
                  <p className="form-message error" role="alert">
                    {errorMessage}
                  </p>
                )}
                <div className="onboarding-actions">
                  <button
                    className="onboarding-secondary"
                    type="button"
                    onClick={() => {
                      setErrorMessage("");
                      setPage("buddy");
                    }}
                  >
                    Back
                  </button>
                  <button
                    className="onboarding-primary compact"
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Saving…" : "Save & start studying"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
