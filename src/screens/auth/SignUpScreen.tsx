import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { supabase } from '../../lib/supabase';
import { clearStoredReferral, getStoredReferral } from '../../lib/referral';
import { colors, spacing, type } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export function SignUpScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [referralCode, setReferralCode] = useState(() => getStoredReferral());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSignUp() {
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const trimmedCode = referralCode.trim().toUpperCase();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: trimmedCode ? { data: { referral_code: trimmedCode } } : undefined,
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    clearStoredReferral();
    // If the project requires email confirmation, signUp() returns no session
    // yet and there's nothing to navigate to — show a "check your email" state
    // instead. Otherwise AuthProvider's onAuthStateChange picks up the new
    // session and App.tsx's AppGate switches to CompleteProfileScreen on its
    // own once it sees a session with no display_name — no navigate() call here.
    if (!data.session) setAwaitingConfirmation(true);
  }

  if (awaitingConfirmation) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>We sent a confirmation link to {email}. Open it to finish creating your account.</Text>
        </View>
        <Button label="Back to log in" variant="ghost" onPress={() => navigation.navigate('Login')} />
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Join creators trading real attention for real views.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextField value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />

          <Text style={styles.label}>Password</Text>
          <TextField value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" />

          <Text style={styles.label}>Confirm password</Text>
          <TextField value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="••••••••" />

          <Text style={styles.label}>Referral code (optional)</Text>
          <TextField
            value={referralCode}
            onChangeText={setReferralCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Friend's code"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label="Create account" onPress={handleSignUp} loading={loading} style={{ marginTop: spacing.md }} />
        </View>

        <Button label="Already have an account? Log in" variant="ghost" onPress={() => navigation.navigate('Login')} />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
    justifyContent: 'space-between',
  },
  header: { marginTop: spacing.xl, gap: spacing.xs },
  title: { ...type.h1, color: colors.text },
  subtitle: { ...type.bodySmall, color: colors.textMuted },
  form: { gap: spacing.sm },
  label: { ...type.label, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: spacing.xs },
  error: { ...type.bodySmall, color: colors.danger, marginTop: spacing.sm },
});
