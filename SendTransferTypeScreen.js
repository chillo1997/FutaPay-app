import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { corridors } from "./Corridors.js";

export default function SendTransferTypeScreen({ navigation, route }) {
  const { country } = route.params || {};
  const [transferType, setTransferType] = useState("");

  // reset if country changes
  useEffect(() => {
    setTransferType("");
  }, [country]);

  const types = country ? Object.keys(corridors[country] || {}) : [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="Transfer Type" navigation={navigation} />

      <View style={styles.pickerWrapper}>
        <Picker selectedValue={transferType} onValueChange={setTransferType}>
          <Picker.Item label="-- Choose Type --" value="" />
          {types.map((t) => (
            <Picker.Item key={t} label={t} value={t} />
          ))}
        </Picker>
      </View>

      <PrimaryButton
        text="Next"
        disabled={!transferType}
        onPress={() =>
          navigation.navigate("SendProvider", { country, transferType })
        }
      />
    </ScrollView>
  );
}
