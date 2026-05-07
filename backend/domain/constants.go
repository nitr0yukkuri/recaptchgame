package domain

// ゲームターゲット（出題のお題）
var Targets = []string{"車", "信号機", "階段", "消火栓"}

// ゲーム画像一覧
var AllImages = []string{
	"/images/car1.jpg", "/images/car2.jpg", "/images/car3.jpg", "/images/car4.jpg", "/images/car5.jpg",
	"/images/shingouki1.jpg", "/images/shingouki2.jpg", "/images/shingouki3.jpg", "/images/shingouki4.jpg",
	"/images/kaidan0.jpg", "/images/kaidan1.jpg", "/images/kaidan2.jpg",
	"/images/shoukasen0.jpg", "/images/shoukasen1.jpg", "/images/shoukasen2.jpg",
	"/images/tamanegi5.png",
}

// 妨害エフェクト
var EffectTypes = []string{"SHAKE", "SPIN", "BLUR", "INVERT", "ONION_RAIN"}

// ターゲット→検索キーのマッピング
var TargetSearchKeyMap = map[string]string{
	"車":   "car",
	"信号機": "shingouki",
	"階段":  "kaidan",
	"消火栓": "shoukasen",
}
