#ifndef NEWSNOOK_BERGAMOT_ENGINE_H
#define NEWSNOOK_BERGAMOT_ENGINE_H

#include <string>
#include <vector>

/**
 * Bergamot/Marian 引擎边界。
 * 未链接 third_party/bergamot-translator 时走 stub，返回清晰错误。
 */
namespace bergamot_engine {

bool engine_ready();
const char* engine_error();

/** 加载语对；0 成功。pair_key 例如 "enzh"。 */
int load(const std::string& pair_key, const std::string& config_yaml);

void unload(const std::string& pair_key);
void unload_all();

/**
 * 翻译一批纯文本。成功返回与 texts 等长的结果；失败抛 std::runtime_error。
 */
std::vector<std::string> translate(
    const std::string& pair_key,
    const std::vector<std::string>& texts
);

}  // namespace bergamot_engine

#endif
