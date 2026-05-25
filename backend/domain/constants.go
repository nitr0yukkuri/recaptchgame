package domain

// ========== 画像定義 ==========
// ImageID は画像の純粋なドメイン識別子
type ImageID string

const (
	// Car images
	CarImage1       ImageID = "car_1"
	CarImage2       ImageID = "car_2"
	CarImage3       ImageID = "car_3"
	CarImage4       ImageID = "car_4"
	CarImage5       ImageID = "car_5"

	// Shingouki images
	ShingokuiImage1 ImageID = "shingouki_1"
	ShingokuiImage2 ImageID = "shingouki_2"
	ShingokuiImage3 ImageID = "shingouki_3"
	ShingokuiImage4 ImageID = "shingouki_4"

	// Kaidan images
	KaidanImage0 ImageID = "kaidan_0"
	KaidanImage1 ImageID = "kaidan_1"
	KaidanImage2 ImageID = "kaidan_2"

	// Shoukasen images
	ShougasenImage0 ImageID = "shoukasen_0"
	ShougasenImage1 ImageID = "shoukasen_1"
	ShougasenImage2 ImageID = "shoukasen_2"

	// Special
	TamaneguiImage5 ImageID = "tamanegu_5"
)

// GetAllImageIDs はすべての画像 ID を返す
func GetAllImageIDs() []string {
	return []string{
		string(CarImage1), string(CarImage2), string(CarImage3), string(CarImage4), string(CarImage5),
		string(ShingokuiImage1), string(ShingokuiImage2), string(ShingokuiImage3), string(ShingokuiImage4),
		string(KaidanImage0), string(KaidanImage1), string(KaidanImage2),
		string(ShougasenImage0), string(ShougasenImage1), string(ShougasenImage2),
		string(TamaneguiImage5),
	}
}

// ========== ターゲット定義 ==========
// TargetType はゲーム内の出題タイプ
type TargetType string

const (
	TargetCar      TargetType = "車"
	TargetSignal   TargetType = "信号機"
	TargetStairs   TargetType = "階段"
	TargetFirePlug TargetType = "消火栓"
)

// GetAllTargets はすべてのターゲットを返す
func GetAllTargets() []string {
	return []string{
		string(TargetCar), string(TargetSignal), string(TargetStairs), string(TargetFirePlug),
	}
}

// ========== 検索キー定義 ==========
// SearchKey は画像名に含まれる識別文字列
const (
	SearchKeyCar      = "car"
	SearchKeySignal   = "shingouki"
	SearchKeyStairs   = "kaidan"
	SearchKeyFirePlug = "shoukasen"
)

// GetSearchKey は TargetType から対応する SearchKey を返す
func GetSearchKey(target string) string {
	switch TargetType(target) {
	case TargetCar:
		return SearchKeyCar
	case TargetSignal:
		return SearchKeySignal
	case TargetStairs:
		return SearchKeyStairs
	case TargetFirePlug:
		return SearchKeyFirePlug
	default:
		return ""
	}
}

// ========== エフェクト定義 ==========
// EffectType は妨害エフェクトの種類
type EffectType string

const (
	EffectShake     EffectType = "SHAKE"
	EffectSpin      EffectType = "SPIN"
	EffectBlur      EffectType = "BLUR"
	EffectInvert    EffectType = "INVERT"
	EffectOnionRain EffectType = "ONION_RAIN"
	EffectGrayscale EffectType = "GRAYSCALE"
	EffectSepia     EffectType = "SEPIA"
	EffectSkew      EffectType = "SKEW"
)

// GetAllEffects はすべてのエフェクトを返す
func GetAllEffects() []string {
	return []string{
		string(EffectShake), string(EffectSpin), string(EffectBlur), string(EffectInvert), string(EffectOnionRain),
		string(EffectGrayscale), string(EffectSepia), string(EffectSkew),
	}
}
