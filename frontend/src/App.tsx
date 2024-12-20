import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  SignedIn,
  SignedOut,
  SignIn,
  SignUp,
  UserButton,
  SignOutButton,
  useAuth,
} from '@clerk/clerk-react';

function App() {
  const { isSignedIn, userId } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  // Create user in the database after registration
  useEffect(() => {
    const createUserInDatabase = async () => {
      if (!userId) return;

      try {
        const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ clerkUserId: userId }),
        });

        const data = await response.json();
        if (response.ok) {
          console.log('User created:', data.user);
        } else {
          console.error('Failed to create user:', data.error);
        }
      } catch (error) {
        console.error('Error creating user:', error);
      }
    };

    createUserInDatabase();
  }, [userId]);

  // Clear local storage when the user is not signed in
  useEffect(() => {
    if (!isSignedIn) {
      localStorage.clear();
      sessionStorage.clear();
      console.log('Storage cleared because user is not signed in');
    }
  }, [isSignedIn]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) {
      alert('Please select a file first.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds the maximum limit of 5MB.');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/voice/transcribe`,
        {
          method: 'POST',
          headers: {
            'clerk-user-id': userId || '',
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      const data = await response.json();
      setTranscription(data.transcription || 'No transcription available');
      setFile(null);
      (document.getElementById('fileInput') as HTMLInputElement).value = '';
    } catch (error) {
      console.error('Error during file upload:', error);
      alert(`Failed to upload file: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCheckout = async () => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/payment/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'clerk-user-id': userId || '',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Error during checkout:', error);
      alert(`Failed to initiate payment: ${error.message || 'Unknown error'}`);
    }
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <div className="min-h-screen flex flex-col items-center justify-center">
              <header className="text-2xl font-bold mb-6">
                Welcome to SaaS Application
              </header>
              <SignedOut>
                <div>
                  <a href="/sign-in" className="text-blue-500 hover:underline">
                    Sign In
                  </a>{' '}
                  |{' '}
                  <a
                    href="/sign-up"
                    className="text-blue-500 hover:underline ml-2"
                  >
                    Sign Up
                  </a>
                </div>
              </SignedOut>
              <SignedIn>
                <p>You are signed in!</p>
                <UserButton />
                <SignOutButton>
                  <button className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600">
                    Sign Out
                  </button>
                </SignOutButton>
              </SignedIn>
            </div>
          }
        />
        <Route path="/sign-in/*" element={<SignIn path="/sign-in" routing="path" />} />
        <Route path="/sign-up/*" element={<SignUp path="/sign-up" routing="path" />} />
        <Route
          path="/transcription"
          element={
            <>
              <SignedIn>
                <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
                  <div className="bg-white shadow-lg rounded-lg p-6 max-w-md text-center">
                    <h1 className="text-2xl font-bold mb-4">
                      Voice-to-Text Transcription
                    </h1>
                    <input
                      id="fileInput"
                      type="file"
                      accept="audio/*"
                      onChange={handleFileChange}
                      className="mb-4"
                    />
                    <button
                      onClick={handleUpload}
                      className={`bg-blue-500 text-white font-semibold py-2 px-4 rounded-md ${
                        isUploading ? 'opacity-50' : 'hover:bg-blue-600'
                      }`}
                      disabled={isUploading}
                    >
                      {isUploading ? 'Uploading...' : 'Upload & Transcribe'}
                    </button>
                    {transcription && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-md">
                        <h3 className="text-lg font-semibold mb-2">
                          Transcription:
                        </h3>
                        <p className="text-gray-800">{transcription}</p>
                      </div>
                    )}
                  </div>
                </div>
              </SignedIn>
              <SignedOut>
                <Navigate to="/" replace />
              </SignedOut>
            </>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
