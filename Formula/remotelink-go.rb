class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.5.1"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.1/remotelink-go-v0.5.1-darwin-arm64", using: :nounzip
      sha256 "857582b665fbca7b2a04886f74cca30a1f73a1915fd71714f966a651d1e6498b"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.1/remotelink-go-v0.5.1-darwin-amd64", using: :nounzip
      sha256 "894c91b5194d952def1db932abb12f231d42ee8224bdb2e87f981bb0f353607b"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.1/remotelink-go-v0.5.1-linux-arm64", using: :nounzip
      sha256 "a56f90715be3f3edce719395d7ce83e4e409bdaab4c70e4c3bedd645cdb591d9"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.1/remotelink-go-v0.5.1-linux-amd64", using: :nounzip
      sha256 "5a901534526d6c33e1e07dc765fb6dd2a4ad5e1114239921550715a1ed44f785"
    end
  end

  def install
    bin.install Dir["remotelink-go-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.5.1", shell_output("#{bin}/remotelink --version").strip
  end
end
