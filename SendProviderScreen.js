import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { corridors } from "./Corridors.js";

export default function SendProviderScreen({ navigation, route }) {
  const { country, transferType } = route.params || {};
  const [providerId, setProviderId] = useState("");

  useEffect(() => {
    setProviderId("");
  }, [country, transferType]);

  const providers = corridors?.[country]?.[transferType] || [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="Select Provider" navigation={navigation} />

      <View style={styles.pickerWrapper}>
        <Picker selectedValue={providerId} onValueChange={setProviderId}>
          <Picker.Item label="-- Choose Provider --" value="" />
          {providers.map((p) => (
            <Picker.Item key={p.id} label={p.label} value={p.id} />
          ))}
        </Picker>
      </View>

      <PrimaryButton
        text="Next"
        disabled={!providerId}
        onPress={() =>
          navigation.navigate("SendPhone", {
            country,
            transferType,
            providerId,
            providerLabel: providers.find((p) => p.id === providerId)?.label,
          })
        }
      />
    </ScrollView>
  );
}
