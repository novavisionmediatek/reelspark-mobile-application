import type { Video } from '../types/database';

export type AuthStackParamList = {
  Welcome: undefined;
  SignUp: undefined;
  Login: undefined;
  ForgotPassword: undefined;
};

export type RootStackParamList = {
  Feed: undefined;
  Submit: undefined;
  Profile: undefined;
  Payment: undefined;
  UserProfile: { userId: string; userName: string };
  VideoPlayer: { videoId: string; video: Video };
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  MyVideos: undefined;
  EditProfile: undefined;
  AccountSettings: undefined;
  Notifications: undefined;
  ReferralWallet: undefined;
  HelpSupport: undefined;
};
